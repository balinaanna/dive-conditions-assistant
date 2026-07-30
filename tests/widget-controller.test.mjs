import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWidgetController, localDateString } = require(
  '../static/widget-controller.js',
);

test('normalizes local dates and creates exactly seven forecast options', () => {
  const today = new Date(2026, 6, 29, 12);
  const controller = createWidgetController({
    initialDate: '2026-07-29',
  });
  const options = controller.forecastDateOptions(today);

  assert.equal(localDateString(today), '2026-07-29');
  assert.equal(options.length, 7);
  assert.equal(options[0].dayLabel, 'Today');
  assert.equal(options[6].value, '2026-08-04');
});

test('date selection reports whether state actually changed', () => {
  const controller = createWidgetController({
    initialDate: '2026-07-29',
  });

  assert.equal(controller.selectDate('2026-07-29'), false);
  assert.equal(controller.selectDate('2026-07-30'), true);
  assert.equal(controller.selectedDate, '2026-07-30');
});

test('only the latest request remains current', () => {
  const controller = createWidgetController();
  const first = controller.beginRequest();
  const second = controller.beginRequest();

  assert.equal(controller.isCurrentRequest(first), false);
  assert.equal(controller.isCurrentRequest(second), true);
});
