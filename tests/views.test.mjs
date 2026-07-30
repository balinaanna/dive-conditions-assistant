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

test('selected-window view renders decision and all condition factors', () => {
  const html = views.renderSelectedWindowPanel({
    status: 'Good',
    windowLabel: '1:00 PM – 2:00 PM',
    explanation: 'Current is mild.',
    primaryAction: 'Conditions look good for this window.',
    factors: [
      {
        label: 'Current speed',
        value: '0.25 kn',
        risk: 'low',
        state: 'Slack',
        role: 'Favorable',
      },
      {
        label: 'Wind',
        value: '5.0 km/h',
        risk: 'low',
        state: 'Light',
        role: 'Favorable',
      },
      {
        label: 'Precipitation',
        value: '0.0 mm total',
        risk: 'low',
        state: 'None',
        role: 'No precipitation expected',
      },
    ],
  });

  assert.match(html, /1:00 PM – 2:00 PM Conditions/);
  assert.match(html, /status-good/);
  assert.match(html, /Current is mild/);
  assert.equal((html.match(/class="factor-card /g) || []).length, 3);
});

test('forecast panel exposes all three chart tabs and a canvas', () => {
  const html = views.renderForecastPanel();

  assert.match(html, /showForecastChart\('wind'\)/);
  assert.match(html, /showForecastChart\('rain'\)/);
  assert.match(html, /showForecastChart\('air'\)/);
  assert.match(html, /id="forecastChart"/);
});

test('loaded details shell connects both bottom tabs to their panels', () => {
  const html = views.renderLoadedDetailsShell();

  assert.match(html, /data-view="selected"/);
  assert.match(html, /data-view="forecast"/);
  assert.match(html, /onclick="setDetailsView\('selected'\)"/);
  assert.match(html, /onclick="setDetailsView\('forecast'\)"/);
  assert.match(html, /id="selectedHourDetails"/);
  assert.match(html, /class="selected-window-body"/);
  assert.match(html, /Always verify conditions on site/);
  assert.match(html, /id="mainPanelContent"/);
});

test('loaded assessment shell includes header, controls, and chart target', () => {
  const html = views.renderLoadedAssessmentShell({
    location: 'Whytecliff Park',
    waterTemperature: '18.5°C',
    dateSelector: '<div data-test="dates"></div>',
    legend: '<div data-test="legend"></div>',
    detailsShell: '<div data-test="details"></div>',
  });

  assert.match(html, /Whytecliff Park, BC, Canada/);
  assert.match(html, /18.5°C/);
  assert.match(html, /id="mainTideChart"/);
  assert.match(html, /data-test="dates"/);
  assert.match(html, /data-test="legend"/);
  assert.match(html, /data-test="details"/);
});

test('loading assessment shell composes every fixed-size placeholder', () => {
  const html = views.renderLoadingAssessmentShell({
    location: 'Whytecliff Park',
    dateSelector: '<div data-test="dates"></div>',
    legend: '<div data-test="legend"></div>',
    loadingChart: '<div data-test="chart"></div>',
    loadingDetails: '<div data-test="details"></div>',
  });

  assert.match(html, /Whytecliff Park, BC, Canada/);
  assert.match(html, /id="waterTemperatureValue"/);
  for (const part of ['dates', 'legend', 'chart', 'details']) {
    assert.match(html, new RegExp(`data-test="${part}"`));
  }
});
