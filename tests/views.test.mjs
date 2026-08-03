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

  assert.match(html, /data-forecast-date="2026-07-30"/);
  assert.doesNotMatch(html, /onclick=/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /Thu/);
});

test('date selector explains when no date has complete current coverage', () => {
  assert.match(
    views.renderForecastDateSelector([], '2026-07-29'),
    /No dates currently have complete current coverage/,
  );
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

test('resource status distinguishes available and unavailable services', () => {
  const html = views.renderResourceStatuses([
    { resource: 'Weather', source: 'Open-Meteo', status: 'available' },
    {
      resource: 'Currents',
      source: 'UBC SalishSeaCast',
      status: 'temporarily_unavailable',
    },
  ]);

  assert.match(html, /Open-Meteo/);
  assert.match(html, /Weather/);
  assert.doesNotMatch(html, />Available</);
  assert.match(html, /UBC SalishSeaCast/);
  assert.match(html, /Currents/);
  assert.match(html, /Temporarily unavailable/);
  assert.match(html, /Data sources/);
});

test('loading resources render individual spinner states', () => {
  const html = views.renderResourceStatuses([
    { resource: 'Weather forecast', status: 'loading' },
    { resource: 'SalishSeaCast currents', status: 'loading' },
  ]);

  assert.equal((html.match(/resource-status loading/g) || []).length, 2);
  assert.doesNotMatch(html, /Temporarily unavailable/);
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

  assert.match(html, /data-chart="wind"/);
  assert.match(html, /data-chart="rain"/);
  assert.match(html, /data-chart="air"/);
  assert.doesNotMatch(html, /onclick=/);
  assert.match(html, /id="forecastChart"/);
});

test('loaded details shell connects all three bottom tabs to their panels', () => {
  const html = views.renderLoadedDetailsShell({
    selectedLocationId: 'whytecliff',
    locations: [
      { id: 'whytecliff', name: 'Whytecliff Park', area: 'West Vancouver' },
      { id: 'ogden_point', name: 'Ogden Point', area: 'Victoria' },
    ],
  });

  assert.match(html, /data-view="selected"/);
  assert.match(html, /data-view="forecast"/);
  assert.match(html, /data-view="location"/);
  assert.match(html, /Change location/);
  assert.match(html, /data-location-id="ogden_point"/);
  assert.match(html, /Ogden Point/);
  assert.doesNotMatch(html, /onclick=/);
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
  assert.match(html, /data-open-location/);
  assert.match(html, />\s*Change location\s*</);
  assert.match(html, /18.5°C/);
  assert.match(html, /id="mainTideChart"/);
  assert.match(html, /data-test="dates"/);
  assert.match(html, /data-test="legend"/);
  assert.match(html, /data-test="details"/);
});

test('incomplete forecast omits chart and selected-window details', () => {
  const html = views.renderLoadedAssessmentShell({
    dateSelector: '<div>dates</div>',
    detailsShell: '<div>details</div>',
    legend: '<div>legend</div>',
    location: 'Whytecliff Park',
    resourceStatuses: [],
    waterTemperature: '12°C',
    forecastAvailable: false,
  });

  assert.match(html, /Complete assessment temporarily unavailable/);
  assert.doesNotMatch(html, /mainTideChart/);
  assert.doesNotMatch(html, /<div>details<\/div>/);
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
