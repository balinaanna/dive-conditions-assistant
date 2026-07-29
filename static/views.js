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

  function renderLoadingChart() {
    return `
      <div
        class="main-tide-chart-wrap loading-chart-placeholder"
        aria-label="Loading tide and assessment chart"
      >
        <div class="skeleton-chart-band"></div>
        <div class="skeleton-chart-grid"></div>
        <div class="skeleton-chart-axis"></div>
      </div>
    `;
  }

  function renderLoadingDetails() {
    return `
      <div class="section details-view-section">
        <div class="details-view-content">
          <div class="details-view-panel active">
            <div class="selected-window-frame loading-selected-frame">
              <div class="loading-assessment-copy">
                <div class="skeleton-line skeleton-label"></div>
                <div class="skeleton-line skeleton-heading"></div>
                <div class="skeleton-line skeleton-copy"></div>
                <div class="skeleton-line skeleton-copy short"></div>
              </div>
              <div class="loading-factor-stack">
                <div class="skeleton-factor"></div>
                <div class="skeleton-factor"></div>
                <div class="skeleton-factor"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="bottom-view-tabs" role="tablist">
          <button class="bottom-view-tab active" type="button" disabled>
            Selected time
          </button>
          <button class="bottom-view-tab" type="button" disabled>
            Daily forecast
          </button>
        </div>
      </div>
    `;
  }

  return {
    renderChartLegend,
    renderForecastDateSelector,
    renderLoadingChart,
    renderLoadingDetails,
    renderSafetyDisclaimer,
  };
});
