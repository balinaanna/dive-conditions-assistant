(function exposeForecastData(root, factory) {
  const forecastData = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = forecastData;
  } else {
    root.ForecastData = forecastData;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

  function createForecastDataService({
    fetchImpl = globalThis.fetch,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    now = () => Date.now(),
  } = {}) {
    const forecastCache = new Map();
    const pendingForecastRequests = new Map();
    const temperatureCache = new Map();
    const pendingTemperatureRequests = new Map();

    function cacheKey(locationId, forecastDate) {
      return `${locationId}:${forecastDate}`;
    }

    function cachedForecastBundle(locationId, forecastDate) {
      const key = cacheKey(locationId, forecastDate);
      const cached = forecastCache.get(key);

      if (!cached) return null;

      if (now() - cached.loadedAt > cacheTtlMs) {
        forecastCache.delete(key);
        return null;
      }

      return cached;
    }

    function fetchJson(url, errorLabel) {
      return fetchImpl(url).then((response) => {
        if (!response.ok) {
          throw new Error(`${errorLabel}: HTTP ${response.status}`);
        }

        return response.json();
      });
    }

    function loadCurrentSpeed(locationId, forecastDate) {
      return fetchJson(
        `/api/current-speed?location=${encodeURIComponent(
          locationId,
        )}&date=${encodeURIComponent(forecastDate)}`,
        'Current-speed request failed',
      ).catch((error) => {
        console.warn('Failed to load SalishSeaCast current speed:', error);
        return null;
      });
    }

    function loadForecastBundle(locationId, forecastDate) {
      const key = cacheKey(locationId, forecastDate);
      const cached = cachedForecastBundle(locationId, forecastDate);

      if (cached) {
        console.info(`Forecast cache hit: ${key}`);
        return Promise.resolve(cached);
      }

      if (pendingForecastRequests.has(key)) {
        return pendingForecastRequests.get(key);
      }

      const requestPromise = Promise.all([
        loadCurrentSpeed(locationId, forecastDate),
        fetchJson(
          `/api/conditions?location=${encodeURIComponent(
            locationId,
          )}&date=${encodeURIComponent(forecastDate)}`,
          'Conditions request failed',
        ),
      ])
        .then(([currentSpeed, conditions]) => {
          const bundle = {
            currentSpeed,
            conditions,
            loadedAt: now(),
          };

          forecastCache.set(key, bundle);
          return bundle;
        })
        .finally(() => {
          pendingForecastRequests.delete(key);
        });

      pendingForecastRequests.set(key, requestPromise);
      return requestPromise;
    }

    function loadTemperatureSummary(locationId, forecastDate) {
      const key = cacheKey(locationId, forecastDate);

      if (temperatureCache.has(key)) {
        return Promise.resolve(temperatureCache.get(key));
      }

      if (pendingTemperatureRequests.has(key)) {
        return pendingTemperatureRequests.get(key);
      }

      const requestPromise = fetchJson(
        `/api/temperatures?location=${encodeURIComponent(
          locationId,
        )}&date=${encodeURIComponent(forecastDate)}`,
        'Temperature request failed',
      )
        .then((temperatures) => {
          temperatureCache.set(key, temperatures);
          return temperatures;
        })
        .finally(() => {
          pendingTemperatureRequests.delete(key);
        });

      pendingTemperatureRequests.set(key, requestPromise);
      return requestPromise;
    }

    function clearCaches() {
      forecastCache.clear();
      temperatureCache.clear();
    }

    return {
      cachedForecastBundle,
      clearCaches,
      loadForecastBundle,
      loadTemperatureSummary,
    };
  }

  return {
    DEFAULT_CACHE_TTL_MS,
    createForecastDataService,
  };
});
