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
