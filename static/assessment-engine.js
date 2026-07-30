(function exposeAssessmentEngine(root, factory) {
  const assessmentEngine = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = assessmentEngine;
  } else {
    root.AssessmentEngine = assessmentEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEngine() {
const SUITABILITY_SAMPLE_STEP_HOURS = 0.25;

function timeToDecimalHour(timeString) {
  const hour = parseInt(timeString.slice(11, 13));
  const minute = parseInt(timeString.slice(14, 16));
  return hour + minute / 60;
}

function hoursFromChartStart(timeString, chartStartTimeString) {
  return (
    (new Date(timeString) - new Date(chartStartTimeString)) /
    (1000 * 60 * 60)
  );
}

function interpolateY(points, xValue) {
  if (!points?.length) return null;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];

    if (xValue >= current.x && xValue <= next.x) {
      const ratio = (xValue - current.x) / (next.x - current.x);
      return current.y + ratio * (next.y - current.y);
    }
  }

  return null;
}

function windRiskForSpeed(speed) {
  if (speed === null || speed === undefined) return 'unknown';
  if (speed > 20) return 'high';
  if (speed > 12) return 'medium';
  return 'low';
}

function precipitationRiskForRate(rate) {
  if (rate === null || rate === undefined) return 'unknown';
  if (rate > 4) return 'high';
  if (rate > 0.5) return 'medium';
  return 'low';
}

function currentRiskForSpeed(speed) {
  if (speed === null || speed === undefined) return 'unknown';
  if (speed > 1.5) return 'high';
  if (speed > 0.75) return 'medium';
  return 'low';
}

function predominantCurrentRisk(speeds, fallbackRisk) {
  if (!speeds.length) return fallbackRisk;

  const counts = speeds.reduce(
    (result, speed) => {
      result[currentRiskForSpeed(speed)] += 1;
      return result;
    },
    { low: 0, medium: 0, high: 0 },
  );
  const halfWindow = speeds.length / 2;

  if (counts.high >= halfWindow) return 'high';
  if (counts.high + counts.medium >= halfWindow) return 'medium';
  return 'low';
}

function getSlackPoints(currentSpeedData) {
  if (!currentSpeedData?.points) return [];

  return currentSpeedData.points
    .filter((point) => point.qualifier === 'SLACK')
    .map((point) => ({
      x: hoursFromChartStart(point.time, currentSpeedData.start_time),
      time: point.time,
    }))
    .filter((point) => point.x >= 0 && point.x <= 24);
}

function valueAt(points, x) {
  const interpolated = interpolateY(points, x);
  if (interpolated !== null) return interpolated;

  const nearest = points.reduce((best, point) => {
    if (!best) return point;
    return Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best;
  }, null);

  return nearest?.y ?? null;
}

function assessSample(context, x) {
  const speed = valueAt(context.currentPoints, x);
  const wind = valueAt(context.windPoints, x);
  const rain = valueAt(context.rainPoints, x);

  if (x < context.sunrise || x >= context.sunset) {
    return {
      status: 'Not Recommended',
      score: 0,
      reason: 'This window is outside daylight hours.',
      currentSpeed: speed,
      wind,
      rain,
    };
  }

  const absSpeed = speed === null ? null : Math.abs(speed);
  let score = 45;
  const reasons = [];

  if (absSpeed === null) {
    reasons.push('Current-speed data is unavailable');
  } else if (absSpeed <= 0.35) {
    score = 78;
    reasons.push('Current is near slack');
  } else if (absSpeed <= 0.75) {
    score = 68;
    reasons.push('Current is relatively mild');
  } else if (absSpeed <= 1.5) {
    score = 45;
    reasons.push('Current requires caution');
  } else {
    score = 20;
    reasons.push('Current is strong');
  }

  const nearestSlack = context.slackPoints.reduce((best, point) => {
    if (!best) return point;
    return Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best;
  }, null);

  if (nearestSlack && Math.abs(nearestSlack.x - x) <= 0.75) {
    const nearestTide = context.tideEvents.reduce((best, event) => {
      if (!best) return event;
      return Math.abs(event.x - nearestSlack.x) <
        Math.abs(best.x - nearestSlack.x)
        ? event
        : best;
    }, null);
    const highTideSlack =
      nearestTide &&
      context.tideHeightMidpoint !== null &&
      nearestTide.height >= context.tideHeightMidpoint;

    score += highTideSlack ? 12 : 5;
    reasons[0] = highTideSlack
      ? 'Slack current near high tide is especially favorable'
      : 'Conditions improve around slack current';
  }

  const windRisk = windRiskForSpeed(wind);
  if (windRisk === 'high') {
    score -= 10;
    reasons.push('wind is strong');
  } else if (windRisk === 'medium') {
    score -= 4;
    reasons.push('wind requires caution');
  }

  const rainRisk = precipitationRiskForRate(rain);
  if (rainRisk === 'high') {
    score -= 6;
    reasons.push('heavy rain slightly lowers suitability');
  } else if (rainRisk === 'medium') {
    score -= 3;
    reasons.push('rain slightly lowers suitability');
  }

  const status =
    score >= 88
      ? 'Ideal'
      : score >= 68
        ? 'Good'
        : score >= 40
          ? 'Ok'
          : 'Not Recommended';

  return {
    status,
    score,
    reason: `${reasons.join('; ')}.`,
    currentSpeed: speed,
    wind,
    rain,
  };
}

function assessmentContext({ hours, currentSpeedData, tides, daily }) {
  const currentPoints = (currentSpeedData?.points || [])
    .map((point) => ({
      x: hoursFromChartStart(point.time, currentSpeedData.start_time),
      y: point.speed,
    }))
    .sort((a, b) => a.x - b.x);
  const tideEvents = (tides?.events || []).map((event) => ({
    x: timeToDecimalHour(event.time),
    height: event.height_m,
  }));
  const tideHeightMidpoint =
    tideEvents.length > 0
      ? (Math.max(...tideEvents.map((event) => event.height)) +
          Math.min(...tideEvents.map((event) => event.height))) /
        2
      : null;

  return {
    currentPoints,
    slackPoints: getSlackPoints(currentSpeedData),
    tideEvents,
    tideHeightMidpoint,
    sunrise: timeToDecimalHour(daily.sunrise),
    sunset: timeToDecimalHour(daily.sunset),
    windPoints: hours.map((hour) => ({
      x: timeToDecimalHour(hour.time),
      y: hour.wind_kmh,
    })),
    rainPoints: hours.map((hour) => ({
      x: timeToDecimalHour(hour.time),
      y: hour.precipitation_mm,
    })),
  };
}

function buildSuitabilityWindows(input) {
  if (!input.hours?.length) return [];

  const context = assessmentContext(input);
  const samples = [];

  for (let start = 0; start < 24; start += SUITABILITY_SAMPLE_STEP_HOURS) {
    const time = start + SUITABILITY_SAMPLE_STEP_HOURS / 2;
    samples.push({
      start,
      end: start + SUITABILITY_SAMPLE_STEP_HOURS,
      ...assessSample(context, time),
    });
  }

  return samples.reduce((windows, sample) => {
    const active = windows[windows.length - 1];
    const details = {
      time: sample.start + SUITABILITY_SAMPLE_STEP_HOURS / 2,
      reason: sample.reason,
      currentSpeed: sample.currentSpeed,
      wind: sample.wind,
      rain: sample.rain,
    };

    if (active?.status === sample.status) {
      active.end = sample.end;
      active.samples.push(details);
      if (sample.score > active.bestScore) {
        active.bestScore = sample.score;
        active.representativeTime = details.time;
        active.reason = sample.reason;
      }
      return windows;
    }

    windows.push({
      start: sample.start,
      end: sample.end,
      status: sample.status,
      bestScore: sample.score,
      representativeTime: details.time,
      reason: sample.reason,
      samples: [details],
    });
    return windows;
  }, []);
}

return {
  SUITABILITY_SAMPLE_STEP_HOURS,
  buildSuitabilityWindows,
  currentRiskForSpeed,
  getSlackPoints,
  hoursFromChartStart,
  interpolateY,
  precipitationRiskForRate,
  predominantCurrentRisk,
  timeToDecimalHour,
  windRiskForSpeed,
};
});
