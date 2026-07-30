import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const metrics = require('../static/condition-metrics.js');

test('extracts absolute current values and their range', () => {
  const values = metrics.numericValues(
    [{ currentSpeed: -1.2 }, { currentSpeed: null }, { currentSpeed: 0.3 }],
    'currentSpeed',
    { absolute: true },
  );
  assert.deepEqual(values, [1.2, 0.3]);
  assert.deepEqual(metrics.range(values), { minimum: 0.3, maximum: 1.2 });
});

test('calculates precipitation total and peak sample', () => {
  const summary = metrics.precipitationSummary(
    [
      { time: 12.25, rain: 0.4 },
      { time: 12.5, rain: 0.8 },
      { time: 12.75, rain: 0.2 },
    ],
    0.25,
  );
  assert.ok(Math.abs(summary.total - 0.35) < Number.EPSILON);
  assert.equal(summary.peak, 0.8);
  assert.equal(summary.peakSample.time, 12.5);
});
