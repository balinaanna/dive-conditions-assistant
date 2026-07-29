import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createForecastChartRenderer,
  createTideChartRenderer,
} = require('../static/chart-renderer.js');

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

test('tide renderer wires assessment windows to chart selection', () => {
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.scales = {
        x: {
          getValueForPixel: (value) => value,
        },
      };
      this.drawCount = 0;
    }

    draw() {
      this.drawCount += 1;
    }
  }

  const listeners = {};
  const canvas = {
    style: {},
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
  };
  const selections = [];
  const renderer = createTideChartRenderer({
    Chart: FakeChart,
    colors: {
      condition: { ideal: 'green' },
      border: { muted: 'gray' },
    },
    formatLocalTime: () => '12:00 PM',
    formatTime: () => '12:00 PM',
    getSelectedWindow: () => null,
    interpolateY: () => 2,
    onSelectWindow: (...args) => selections.push(args),
    sameRange: (left, right) => left === right,
    timeToDecimalHour: (time) => Number(time),
  });
  const window = { start: 10, end: 12, status: 'Good' };
  const chart = renderer.drawTideChart({
    canvas,
    currentDecimalHour: 11,
    currentSpeedData: {
      start_time: '2026-07-29T00:00:00-07:00',
      points: [],
    },
    data: {
      daily: { sunrise: '6', sunset: '21' },
      tides: {
        curve: [
          { time: '0', height_m: 1 },
          { time: '12', height_m: 4 },
        ],
      },
    },
    showNow: true,
    slackPoints: [],
    suitabilityWindows: [window],
  });

  chart.config.options.onClick({ x: 11 }, [], chart);

  assert.deepEqual(selections, [[window, 11]]);
  assert.equal(chart.drawCount, 1);
  assert.equal(
    chart.config.options.plugins.suitabilityWindows.windows[0],
    window,
  );
  assert.equal(chart.config.options.plugins.nowMarker.xValue, 11);
  assert.equal(typeof listeners.mousemove, 'function');
  assert.equal(typeof listeners.mouseleave, 'function');
});
