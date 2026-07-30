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

  function statusClass(status) {
    if (status === 'Ideal') return 'status-ideal';
    if (status === 'Good') return 'status-good';
    if (status === 'Ok') return 'status-ok';
    return 'status-not-recommended';
  }

  function statusLabel(status) {
    if (status === 'Ok') return 'Use caution';
    if (status === 'Not Recommended') return 'Not recommended';
    return status;
  }

  function renderFactorCard({ label, value, risk, state, role }) {
    return `
      <div class="factor-card factor-card-${risk}">
        <span class="factor-label">${label}</span>
        <div class="factor-value-row">
          <span class="risk-dot risk-${risk}"></span>
          <strong>${value}</strong>
        </div>
        <div class="factor-meaning">
          <span class="factor-state factor-state-${risk}">${state}</span>
          <span class="factor-role">${role}</span>
        </div>
      </div>
    `;
  }

  function renderSelectedWindowPanel({
    explanation,
    factors,
    primaryAction,
    status,
    windowLabel,
  }) {
    const badgeClass = statusClass(status);

    return `
      <div class="assessment-content-grid">
        <div class="assessment-decision">
          <div class="assessment-overview ${badgeClass}-overview">
            <div class="assessment-window-label">Selected window</div>
            <div class="assessment-title-row">
              <div class="details-time">${windowLabel} Conditions</div>
              <span class="status-chip ${badgeClass}">
                ${statusLabel(status)}
              </span>
            </div>
            <div class="assessment-rationale">
              <span class="assessment-rationale-label">Key reason</span>
              <span class="assessment-summary">${explanation}</span>
            </div>
          </div>
          <div class="recommendation-block">
            <div class="assessment-section-title">Recommendation</div>
            <div class="recommendation-action">${primaryAction}</div>
            <div class="recommendation-note">
              Confirm actual conditions on site before entering the water.
            </div>
          </div>
        </div>
        <div class="factor-grid">
          ${factors.map(renderFactorCard).join('')}
        </div>
      </div>
    `;
  }

  function renderForecastPanel() {
    return `
      <div class="forecast-tabs">
        <button class="forecast-tab active" data-chart="wind" onclick="showForecastChart('wind')">Wind</button>
        <button class="forecast-tab" data-chart="rain" onclick="showForecastChart('rain')">Precipitation</button>
        <button class="forecast-tab" data-chart="air" onclick="showForecastChart('air')">Air</button>
      </div>
      <div class="forecast-chart-wrap">
        <canvas id="forecastChart"></canvas>
      </div>
    `;
  }

  function renderLoadedDetailsShell() {
    return `
      <div class="section details-view-section">
        <div class="details-view-content">
          <div class="details-view-panel active" data-view="selected">
            <div id="selectedHourDetails" class="selected-window-frame"></div>
          </div>
          <div
            class="details-view-panel details-view-panel-forecast"
            data-view="forecast"
          >
            <div id="mainPanelContent" class="main-panel-content"></div>
          </div>
        </div>
        <div class="bottom-view-tabs" role="tablist">
          <button
            class="bottom-view-tab active"
            data-view="selected"
            type="button"
            role="tab"
            aria-selected="true"
            onclick="setDetailsView('selected')"
          >
            Selected time
          </button>
          <button
            class="bottom-view-tab"
            data-view="forecast"
            type="button"
            role="tab"
            aria-selected="false"
            onclick="setDetailsView('forecast')"
          >
            Daily forecast
          </button>
        </div>
      </div>
    `;
  }

  return {
    renderChartLegend,
    renderForecastDateSelector,
    renderForecastPanel,
    renderLoadingChart,
    renderLoadingDetails,
    renderLoadedDetailsShell,
    renderSafetyDisclaimer,
    renderSelectedWindowPanel,
  };
});
