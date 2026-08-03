import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWidgetController, localDateString } = require(
  '../static/widget-controller.js',
);

test('defaults to two forecast dates while current coverage loads', () => {
  const today = new Date(2026, 6, 29, 12);
  const controller = createWidgetController({
    initialDate: '2026-07-29',
  });
  const options = controller.forecastDateOptions(today);

  assert.equal(localDateString(today), '2026-07-29');
  assert.equal(options.length, 2);
  assert.equal(options[0].dayLabel, 'Today');
  assert.equal(options[1].value, '2026-07-30');
});

test('shows only dates with full current forecast coverage', () => {
  const today = new Date(2026, 6, 29, 12);
  const controller = createWidgetController({
    initialDate: '2026-07-29',
  });

  controller.setAvailableForecastDates([
    '2026-07-29',
    '2026-07-30',
  ]);

  assert.deepEqual(
    controller.forecastDateOptions(today).map((option) => option.value),
    ['2026-07-29', '2026-07-30'],
  );
});

test('shows no date options when current coverage is unavailable', () => {
  const controller = createWidgetController();
  controller.setAvailableForecastDates([]);

  assert.deepEqual(controller.forecastDateOptions(), []);
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

test('tracks only supported bottom-panel views', () => {
  const controller = createWidgetController();

  assert.equal(controller.activeView, 'selected');
  assert.equal(controller.selectView('forecast'), true);
  assert.equal(controller.activeView, 'forecast');
  assert.equal(controller.selectView('location'), true);
  assert.equal(controller.activeView, 'location');
  assert.equal(controller.selectView('unknown'), false);
  assert.equal(controller.activeView, 'location');
});

test('location selection resets location-specific coverage and selected view', () => {
  const controller = createWidgetController();
  controller.setAvailableForecastDates(['2026-07-29']);
  controller.selectView('location');

  assert.equal(controller.selectLocation('ogden_point'), true);
  assert.equal(controller.locationId, 'ogden_point');
  assert.equal(controller.activeView, 'selected');
  assert.equal(controller.forecastDateOptions(new Date(2026, 6, 29)).length, 2);
  assert.equal(controller.selectLocation('ogden_point'), false);
});
