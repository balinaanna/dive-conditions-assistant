import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const views = require('../static/views.js');

test('date selector marks only the selected forecast date', () => {
  const html = views.renderForecastDateSelector(
    [
      { value: '2026-07-29', dayLabel: 'Today', dateLabel: 'Jul 29' },
      { value: '2026-07-30', dayLabel: 'Thu', dateLabel: 'Jul 30' },
    ],
    '2026-07-30',
  );

  assert.match(html, /onclick="selectForecastDate\('2026-07-30'\)"/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /Thu/);
});

test('legend contains every assessment category and current scale', () => {
  const html = views.renderChartLegend();

  for (const label of [
    'Ideal',
    'Good',
    'Use caution',
    'Not recommended',
    'Current speed',
    'High',
  ]) {
    assert.match(html, new RegExp(label));
  }
});

test('safety disclaimer remains available to every details view', () => {
  assert.match(
    views.renderSafetyDisclaimer(),
    /Always verify conditions on site/,
  );
});

test('loading views reserve space for charts and condition details', () => {
  assert.match(views.renderLoadingChart(), /skeleton-chart-grid/);
  assert.match(views.renderLoadingDetails(), /loading-selected-frame/);
  assert.equal(
    (views.renderLoadingDetails().match(/skeleton-factor/g) || []).length,
    3,
  );
});
