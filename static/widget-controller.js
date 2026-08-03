(function exposeWidgetController(root, factory) {
  const controllerModule = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = controllerModule;
  } else {
    root.WidgetController = controllerModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function createWidgetController({
    initialDate = localDateString(),
    locationId = 'whytecliff',
  } = {}) {
    let selectedDate = initialDate;
    let latestRequestId = 0;
    let activeView = 'selected';
    let availableForecastDates = null;

    function beginRequest() {
      latestRequestId += 1;
      return latestRequestId;
    }

    function isCurrentRequest(requestId) {
      return requestId === latestRequestId;
    }

    function selectDate(date) {
      const changed = date !== selectedDate;
      selectedDate = date;
      return changed;
    }

    function selectView(viewName) {
      if (!['selected', 'forecast'].includes(viewName)) return false;
      activeView = viewName;
      return true;
    }

    function forecastDateOptions(today = new Date()) {
      const options = Array.from({ length: 3 }, (_, offset) => {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        return {
          value: localDateString(date),
          dayLabel:
            offset === 0
              ? 'Today'
              : date.toLocaleDateString('en-US', { weekday: 'short' }),
          dateLabel: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
        };
      });

      if (availableForecastDates) {
        return options.filter((option) =>
          availableForecastDates.has(option.value),
        );
      }

      // Avoid advertising the commonly partial third model day while the
      // current-coverage response is still loading.
      return options.slice(0, 2);
    }

    function setAvailableForecastDates(dates) {
      if (!Array.isArray(dates) || dates.length === 0) return false;
      availableForecastDates = new Set(dates);
      return true;
    }

    return {
      beginRequest,
      forecastDateOptions,
      get activeView() {
        return activeView;
      },
      get locationId() {
        return locationId;
      },
      get selectedDate() {
        return selectedDate;
      },
      isCurrentRequest,
      selectDate,
      selectView,
      setAvailableForecastDates,
    };
  }

  return { createWidgetController, localDateString };
});
