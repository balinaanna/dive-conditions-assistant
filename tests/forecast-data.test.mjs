import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createForecastDataService } = require('../static/forecast-data.js');

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('simultaneous forecast requests share one set of API calls', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);

    if (url.startsWith('/api/current-speed')) {
      return jsonResponse({ points: [] });
    }

    return jsonResponse({ daily: { date: '2026-07-29' } });
  };
  const service = createForecastDataService({ fetchImpl });

  const first = service.loadForecastBundle('whytecliff', '2026-07-29');
  const second = service.loadForecastBundle('whytecliff', '2026-07-29');
  const [firstBundle, secondBundle] = await Promise.all([first, second]);

  assert.strictEqual(firstBundle, secondBundle);
  assert.equal(calls.length, 2);
});

test('forecast cache is reused until its expiry', async () => {
  let currentTime = 1_000;
  let requestCount = 0;
  const service = createForecastDataService({
    cacheTtlMs: 100,
    now: () => currentTime,
    fetchImpl: async (url) => {
      requestCount += 1;
      return url.startsWith('/api/current-speed')
        ? jsonResponse({ points: [] })
        : jsonResponse({ requestCount });
    },
  });

  const first = await service.loadForecastBundle('whytecliff', '2026-07-29');
  currentTime += 50;
  const cached = await service.loadForecastBundle('whytecliff', '2026-07-29');

  assert.strictEqual(cached, first);
  assert.equal(requestCount, 2);

  currentTime += 101;
  const refreshed = await service.loadForecastBundle(
    'whytecliff',
    '2026-07-29',
  );

  assert.notStrictEqual(refreshed, first);
  assert.equal(requestCount, 4);
});

test('temperature requests use their own cache', async () => {
  let requestCount = 0;
  const service = createForecastDataService({
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse({ water_temp_c: 18.5 });
    },
  });

  const first = await service.loadTemperatureSummary(
    'whytecliff',
    '2026-07-29',
  );
  const cached = await service.loadTemperatureSummary(
    'whytecliff',
    '2026-07-29',
  );

  assert.deepEqual(first, { water_temp_c: 18.5 });
  assert.strictEqual(cached, first);
  assert.equal(requestCount, 1);
});
