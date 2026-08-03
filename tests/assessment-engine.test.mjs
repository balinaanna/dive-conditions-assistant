import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSuitabilityWindows,
  currentRiskForSpeed,
  getSlackPoints,
  precipitationRiskForRate,
  windRiskForSpeed,
} = require('../static/assessment-engine.js');

test('keeps actual slack, estimated reversals, and minima distinct', () => {
  const points = getSlackPoints({
    start_time: '2026-07-29T00:00:00-07:00',
    points: [
      {
        time: '2026-07-29T06:00:00-07:00',
        qualifier: 'SLACK',
      },
      {
        time: '2026-07-29T12:00:00-07:00',
        event_time: '2026-07-29T11:45:00-07:00',
        qualifier: 'ESTIMATED_REVERSAL',
      },
      {
        time: '2026-07-29T18:00:00-07:00',
        qualifier: 'LOW_CURRENT_MINIMUM',
      },
    ],
  });

  assert.deepEqual(
    points.map(({ label }) => label),
    ['Slack', 'Est. reversal', 'Low-current minimum'],
  );
  assert.equal(points[1].x, 11.75);
});

function hourlyForecast({ wind = 5, precipitation = 0 } = {}) {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `2026-07-29T${String(hour).padStart(2, '0')}:00:00-07:00`,
    wind_kmh: wind,
    precipitation_mm: precipitation,
  }));
}

function assessmentInput(overrides = {}) {
  return {
    hours: hourlyForecast(),
    currentSpeedData: {
      start_time: '2026-07-29T00:00:00-07:00',
      points: [
        {
          time: '2026-07-29T00:00:00-07:00',
          speed: 0,
          qualifier: null,
        },
        {
          time: '2026-07-29T06:00:00-07:00',
          speed: 0,
          qualifier: 'ESTIMATED_REVERSAL',
          event_time: '2026-07-29T06:00:00-07:00',
        },
        {
          time: '2026-07-29T12:00:00-07:00',
          speed: 0,
          qualifier: 'ESTIMATED_REVERSAL',
          event_time: '2026-07-29T12:00:00-07:00',
        },
        {
          time: '2026-07-30T00:00:00-07:00',
          speed: 0,
          qualifier: null,
        },
      ],
    },
    tides: {
      events: [
        { time: '2026-07-29T06:00:00-07:00', height_m: 1 },
        { time: '2026-07-29T12:00:00-07:00', height_m: 4 },
      ],
    },
    daily: {
      sunrise: '2026-07-29T05:00:00-07:00',
      sunset: '2026-07-29T21:00:00-07:00',
    },
    ...overrides,
  };
}

function sampleAt(windows, time) {
  const window = windows.find(
    (candidate) => time >= candidate.start && time < candidate.end,
  );
  return { window, sample: window?.samples.find((item) => item.time === time) };
}

test('weather and current risk thresholds remain deterministic', () => {
  assert.equal(currentRiskForSpeed(0.75), 'low');
  assert.equal(currentRiskForSpeed(0.76), 'medium');
  assert.equal(currentRiskForSpeed(1.51), 'high');
  assert.equal(windRiskForSpeed(12), 'low');
  assert.equal(windRiskForSpeed(12.1), 'medium');
  assert.equal(windRiskForSpeed(20.1), 'high');
  assert.equal(precipitationRiskForRate(0.5), 'low');
  assert.equal(precipitationRiskForRate(0.6), 'medium');
  assert.equal(precipitationRiskForRate(4.1), 'high');
});

test('interpolates SalishSeaCast vectors before calculating current speed', () => {
  const input = assessmentInput();
  input.currentSpeedData.points = [
    {
      time: '2026-07-29T11:00:00-07:00',
      speed: 1,
      east_kn: 1,
      north_kn: 0,
      qualifier: null,
    },
    {
      time: '2026-07-29T13:00:00-07:00',
      speed: 1,
      east_kn: -1,
      north_kn: 0,
      qualifier: null,
    },
  ];

  const windows = buildSuitabilityWindows(input);
  const midpoint = sampleAt(windows, 12.125).sample;

  assert.ok(midpoint.currentSpeed < 0.3);
  assert.match(midpoint.reason, /speed is low/);
});

test('does not extrapolate missing current coverage across the day', () => {
  const input = assessmentInput();
  input.currentSpeedData.points = [
    {
      time: '2026-07-29T00:30:00-07:00',
      speed: 0.2,
      east_kn: 0.2,
      north_kn: 0,
      qualifier: null,
    },
  ];

  const windows = buildSuitabilityWindows(input);

  assert.equal(sampleAt(windows, 12.125).window.status, 'Not Recommended');
  assert.match(
    sampleAt(windows, 12.125).sample.reason,
    /current-speed forecast is unavailable/i,
  );
});

test('high-tide estimated reversal is Ideal while low-tide reversal is Good', () => {
  const windows = buildSuitabilityWindows(assessmentInput());

  assert.equal(sampleAt(windows, 6.125).window.status, 'Good');
  assert.match(
    sampleAt(windows, 6.125).sample.reason,
    /estimated current reversal/,
  );
  assert.equal(sampleAt(windows, 12.125).window.status, 'Ideal');
  assert.match(
    sampleAt(windows, 12.125).sample.reason,
    /estimated reversal and high tide/,
  );
});

test('low-current minimum does not receive the estimated-reversal bonus', () => {
  const input = assessmentInput();
  input.currentSpeedData.points[2].qualifier = 'LOW_CURRENT_MINIMUM';
  delete input.currentSpeedData.points[2].event_time;

  const windows = buildSuitabilityWindows(input);
  const noon = sampleAt(windows, 12.125);

  assert.equal(noon.window.status, 'Good');
  assert.match(noon.sample.reason, /speed is low/i);
  assert.doesNotMatch(noon.sample.reason, /reversal/i);
});

test('dark hours are always Not Recommended', () => {
  const windows = buildSuitabilityWindows(assessmentInput());

  assert.equal(sampleAt(windows, 2.125).window.status, 'Not Recommended');
  assert.match(
    sampleAt(windows, 2.125).sample.reason,
    /outside daylight hours/,
  );
});

test('moderate wind lowers high-tide reversal from Ideal to Good', () => {
  const windows = buildSuitabilityWindows(
    assessmentInput({ hours: hourlyForecast({ wind: 15 }) }),
  );

  assert.equal(sampleAt(windows, 12.125).window.status, 'Good');
  assert.match(
    sampleAt(windows, 12.125).sample.reason,
    /wind requires caution/,
  );
});

test('windows cover the full day and merge adjacent matching ratings', () => {
  const windows = buildSuitabilityWindows(assessmentInput());

  assert.equal(windows[0].start, 0);
  assert.equal(windows.at(-1).end, 24);
  windows.forEach((window, index) => {
    if (index === 0) return;
    assert.equal(windows[index - 1].end, window.start);
    assert.notEqual(windows[index - 1].status, window.status);
  });
});
