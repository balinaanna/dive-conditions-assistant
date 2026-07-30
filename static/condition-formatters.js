(function exposeFormatters(root, factory) {
  const formatters = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = formatters;
  } else {
    root.ConditionFormatters = formatters;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  function formatTime12(timeString) {
    const hour = parseInt(timeString.slice(11, 13));
    const minute = timeString.slice(14, 16);
    const period = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${minute} ${period}`;
  }

  function formatHour12(timeString) {
    const hour = parseInt(timeString.slice(11, 13));
    return `${hour % 12 || 12}${hour >= 12 ? 'PM' : 'AM'}`;
  }

  function formatDecimalTime(value) {
    const totalMinutes = Math.round(value * 60);
    const hour = ((Math.floor(totalMinutes / 60) % 24) + 24) % 24;
    const minute = ((totalMinutes % 60) + 60) % 60;
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${
      hour >= 12 ? 'PM' : 'AM'
    }`;
  }

  function formatSuitabilityWindow(window) {
    if (!window) return '';
    return `${formatDecimalTime(window.start)} – ${formatDecimalTime(
      window.end,
    )}`;
  }

  function displayValue(value, unit = '') {
    return value === null || value === undefined ? 'N/A' : `${value}${unit}`;
  }

  return {
    displayValue,
    formatDecimalTime,
    formatHour12,
    formatSuitabilityWindow,
    formatTime12,
  };
});
