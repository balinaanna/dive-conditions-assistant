import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSuitabilityWindows,
  currentRiskForSpeed,
  precipitationRiskForRate,
  windRiskForSpeed,
} = require('../static/assessment-engine.js');

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
          qualifier: 'SLACK',
        },
        {
          time: '2026-07-29T12:00:00-07:00',
          speed: 0,
          qualifier: 'SLACK',
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

test('high-tide slack is Ideal while low-tide slack is Good', () => {
  const windows = buildSuitabilityWindows(assessmentInput());

  assert.equal(sampleAt(windows, 6.125).window.status, 'Good');
  assert.match(
    sampleAt(windows, 6.125).sample.reason,
    /Conditions improve around slack current/,
  );
  assert.equal(sampleAt(windows, 12.125).window.status, 'Ideal');
  assert.match(
    sampleAt(windows, 12.125).sample.reason,
    /Slack current near high tide is especially favorable/,
  );
});

test('dark hours are always Not Recommended', () => {
  const windows = buildSuitabilityWindows(assessmentInput());

  assert.equal(sampleAt(windows, 2.125).window.status, 'Not Recommended');
  assert.match(
    sampleAt(windows, 2.125).sample.reason,
    /outside daylight hours/,
  );
});

test('moderate wind lowers high-tide slack from Ideal to Good', () => {
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
