import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createForecastChartRenderer } = require('../static/chart-renderer.js');

function createRenderer() {
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
    }
  }

  return createForecastChartRenderer({
    Chart: FakeChart,
    colors: {
      condition: {
        ideal: 'green',
        ok: 'amber',
        notRecommended: 'red',
      },
      border: {
        muted: 'gray',
      },
    },
    formatHour: (time) => time.slice(11, 13),
    getCurrentHourIndex: () => 1,
    windRiskForSpeed: (speed) => {
      if (speed > 20) return 'high';
      if (speed > 12) return 'medium';
      return 'low';
    },
  });
}

const forecast = {
  hourly_forecast: [
    { time: '2026-07-29T00:00', wind_kmh: 5, air_temp_c: 15 },
    { time: '2026-07-29T01:00', wind_kmh: 15, air_temp_c: 14 },
    { time: '2026-07-29T02:00', wind_kmh: 25, air_temp_c: 13 },
  ],
};

test('forecast renderer maps wind risk to chart colors', () => {
  const chart = createRenderer().drawForecastChart({
    canvas: {},
    data: forecast,
    metric: 'wind_kmh',
    label: 'Wind',
    unit: 'km/h',
    showNow: true,
  });

  assert.deepEqual(
    chart.config.data.datasets[0].pointBackgroundColor,
    ['green', 'amber', 'red'],
  );
  assert.equal(chart.config.options.plugins.nowMarker.index, 1);
  assert.equal(chart.config.options.scales.y.beginAtZero, true);
});

test('air temperature chart does not force the axis to zero', () => {
  const chart = createRenderer().drawForecastChart({
    canvas: {},
    data: forecast,
    metric: 'air_temp_c',
    label: 'Air temperature',
    unit: '°C',
    showNow: false,
  });

  assert.equal(chart.config.options.plugins.nowMarker.index, -1);
  assert.equal(chart.config.options.scales.y.beginAtZero, false);
  assert.equal(
    chart.config.options.plugins.tooltip.callbacks.label({ raw: 15 }),
    'Air temperature: 15 °C',
  );
});
