import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const formatters = require('../static/condition-formatters.js');

test('formats midnight, noon, and fractional-hour windows', () => {
  assert.equal(formatters.formatTime12('2026-07-29T00:15'), '12:15 AM');
  assert.equal(formatters.formatHour12('2026-07-29T12:00'), '12PM');
  assert.equal(
    formatters.formatSuitabilityWindow({ start: 13.25, end: 19 }),
    '1:15 PM – 7:00 PM',
  );
});

test('formats values with units and unavailable fallbacks', () => {
  assert.equal(formatters.displayValue(18.5, '°C'), '18.5°C');
  assert.equal(formatters.displayValue(null, '°C'), 'N/A');
});
