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

    function selectDate(date) {
      const changed = date !== selectedDate;
      selectedDate = date;
      return changed;
    }

    function forecastDateOptions(today = new Date()) {
      return Array.from({ length: 7 }, (_, offset) => {
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
    }

    return {
      forecastDateOptions,
      get locationId() {
        return locationId;
      },
      get selectedDate() {
        return selectedDate;
      },
      selectDate,
    };
  }

  return { createWidgetController, localDateString };
});
