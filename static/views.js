(function exposeViews(root, factory) {
  const views = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = views;
  } else {
    root.DiveViews = views;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createViews() {
  function renderForecastDateSelector(options, selectedDate) {
    return `
      <div class="forecast-date-selector" aria-label="Forecast date">
        ${options
          .map(
            (option) => `
              <button
                class="forecast-date-choice ${
                  option.value === selectedDate ? 'active' : ''
                }"
                type="button"
                aria-pressed="${
                  option.value === selectedDate ? 'true' : 'false'
                }"
                onclick="selectForecastDate('${option.value}')"
              >
                <span class="forecast-date-day">${option.dayLabel}</span>
                <span class="forecast-date-value">${option.dateLabel}</span>
              </button>
            `,
          )
          .join('')}
      </div>
    `;
  }

  function renderChartLegend() {
    return `
      <div class="chart-range-legend">
        <div class="legend-block legend-block-assessment">
          <div class="legend-group-label">Assessment</div>
          <div class="suitability-key">
            <span class="status-key-item">
              <span class="status-key-swatch ideal"></span>Ideal
            </span>
            <span class="status-key-item">
              <span class="status-key-swatch good"></span>Good
            </span>
            <span class="status-key-item">
              <span class="status-key-swatch caution"></span>Use caution
            </span>
            <span class="status-key-item">
              <span class="status-key-swatch bad"></span>Not recommended
            </span>
          </div>
        </div>
        <div class="legend-block legend-block-current">
          <div class="current-speed-key-label">Current speed</div>
          <div class="current-speed-key">
            <span class="current-speed-key-value">0</span>
            <span class="current-speed-gradient" aria-hidden="true"></span>
            <span class="current-speed-key-value">High</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderSafetyDisclaimer() {
    return `
      <p class="safety-disclaimer">
        Forecast guidance only. Always verify conditions on site and use your
        own judgment before entering the water.
      </p>
    `;
  }

  return {
    renderChartLegend,
    renderForecastDateSelector,
    renderSafetyDisclaimer,
  };
});
