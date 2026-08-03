import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerDiveChartPlugins } = require('../static/chart-plugins.js');

test('registers the complete tide-chart plugin set', () => {
  const registered = [];

  registerDiveChartPlugins({
    Chart: {
      register: (...plugins) => registered.push(...plugins),
    },
    colors: {
      chart: { night: 'night' },
      text: { primary: 'primary', secondary: 'secondary' },
      border: { muted: 'muted' },
      red: { 700: 'red' },
      nowMarker: { fill: 'red-fill' },
    },
    interpolateY: () => 0,
    sameRange: () => false,
  });

  assert.deepEqual(
    registered.map((plugin) => plugin.id),
    [
      'eventLabelBand',
      'daylight',
      'nowMarker',
      'suitabilityWindows',
      'slackMarkers',
      'sunriseSunset',
      'tideHeightLabel',
    ],
  );
});

test('renders the event-specific marker label instead of always saying Slack', () => {
  const registered = [];
  const labels = [];
  registerDiveChartPlugins({
    Chart: {
      register: (...plugins) => registered.push(...plugins),
    },
    colors: {
      chart: { night: 'night' },
      text: { primary: 'primary', secondary: 'secondary' },
      border: { muted: 'muted' },
      red: { 700: 'red' },
      nowMarker: { fill: 'red-fill' },
    },
    interpolateY: () => 1,
    sameRange: () => false,
  });
  const plugin = registered.find(({ id }) => id === 'slackMarkers');
  const context = {
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fill() {},
    fillText(value) { labels.push(value); },
  };

  plugin.afterDatasetsDraw(
    {
      ctx: context,
      chartArea: { top: 0, bottom: 100 },
      scales: {
        x: { getPixelForValue: () => 20 },
        y: { getPixelForValue: () => 30 },
      },
      data: { datasets: [{ data: [] }] },
    },
    {},
    {
      points: [{ x: 3, time: 'time', label: 'Est. reversal' }],
      currentSpeedLineColor: () => 'green',
      formatTime: () => '3:00 AM',
    },
  );

  assert.deepEqual(labels, ['Est. reversal', '3:00 AM']);
});
