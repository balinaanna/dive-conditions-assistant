(function exposeViews(root, factory) {
  const views = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = views;
  } else {
    root.DiveViews = views;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createViews() {
  function renderForecastDateSelector(options, selectedDate) {
    if (options.length === 0) {
      return `
        <div class="forecast-date-selector-empty">
          No dates currently have complete current coverage.
        </div>
      `;
    }

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
                data-forecast-date="${option.value}"
                aria-pressed="${
                  option.value === selectedDate ? 'true' : 'false'
                }"
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

  function renderResourceStatuses(statuses) {
    return `
      <div class="resource-statuses" aria-label="Forecast resource status">
        <div class="resource-statuses-label">Data sources</div>
        ${statuses
          .map((item) => {
            const available = item.status === 'available';
            const loading = item.status === 'loading';
            const statusLabel = item.status === 'temporarily_unavailable'
              ? 'Temporarily unavailable'
              : '';
            return `
              <span class="resource-status ${
                available ? 'available' : loading ? 'loading' : 'unavailable'
              }">
                <span class="resource-status-dot" aria-hidden="true"></span>
                <span class="resource-status-name">
                  ${item.source ? `<strong>${item.source}</strong> — ` : ''}${
                    item.resource
                  }
                </span>
                ${statusLabel ? `
                  <span class="resource-status-label">${statusLabel}</span>
                ` : ''}
              </span>
            `;
          })
          .join('')}
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
          <button class="bottom-view-tab" type="button" disabled>
            Change location
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
        <button class="forecast-tab active" data-chart="wind">Wind</button>
        <button class="forecast-tab" data-chart="rain">Precipitation</button>
        <button class="forecast-tab" data-chart="air">Air</button>
      </div>
      <div class="forecast-chart-wrap">
        <canvas id="forecastChart"></canvas>
      </div>
    `;
  }

  function renderLocationPanel(locations, selectedLocationId) {
    return `
      <div class="location-panel-heading">Popular supported BC dive sites</div>
      <div class="location-list" role="list">
        ${locations.map((location) => `
          <button
            class="location-choice ${location.id === selectedLocationId ? 'active' : ''}"
            type="button"
            data-location-id="${location.id}"
            aria-pressed="${location.id === selectedLocationId}"
            role="listitem"
          >
            <span class="location-choice-name">${location.name}</span>
            <span class="location-choice-area">${location.area}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderLoadedDetailsShell({ locations = [], selectedLocationId } = {}) {
    return `
      <div class="section details-view-section">
        <div class="details-view-content">
          <div class="details-view-panel active" data-view="selected">
            <div class="selected-window-frame">
              <div
                id="selectedHourDetails"
                class="selected-window-body"
              ></div>
              ${renderSafetyDisclaimer()}
            </div>
          </div>
          <div
            class="details-view-panel details-view-panel-forecast"
            data-view="forecast"
          >
            <div id="mainPanelContent" class="main-panel-content"></div>
          </div>
          <div class="details-view-panel" data-view="location">
            ${renderLocationPanel(locations, selectedLocationId)}
          </div>
        </div>
        <div class="bottom-view-tabs" role="tablist">
          <button
            class="bottom-view-tab active"
            data-view="selected"
            type="button"
            role="tab"
            aria-selected="true"
          >
            Selected time
          </button>
          <button
            class="bottom-view-tab"
            data-view="forecast"
            type="button"
            role="tab"
            aria-selected="false"
          >
            Daily forecast
          </button>
          <button
            class="bottom-view-tab"
            data-view="location"
            type="button"
            role="tab"
            aria-selected="false"
          >
            Change location
          </button>
        </div>
      </div>
    `;
  }

  function renderLoadedAssessmentShell({
    dateSelector,
    detailsShell,
    legend,
    location,
    resourceStatuses = [],
    waterTemperature,
    forecastAvailable = true,
  }) {
    return `
      <div class="section mt-2 timing-chart-section">
        <div class="row g-2 assessment-header-row">
          <div class="col assessment-location-column">
            <div class="assessment-context">
              <div class="assessment-context-label">
                Dive conditions assessment for
              </div>
              <div class="location-title-row">
                <h1 class="dive-site">${location}, BC, Canada</h1>
                <button
                  class="header-location-link"
                  type="button"
                  data-open-location
                >
                  Change location
                </button>
              </div>
            </div>
          </div>
          <div class="col-auto assessment-temperature-column">
            <div class="facts">
              <div class="fact">
                <div class="fact-label">Water</div>
                <div class="fact-value">${waterTemperature}</div>
              </div>
            </div>
          </div>
        </div>
        <strong class="timing-header">
          When do conditions look most suitable?
        </strong>
        <div class="forecast-controls">
          <div class="forecast-date-control">
            <div class="workflow-instruction date-instruction-line">
              <strong>Select a date.</strong>
              <span>Dates shown have full current forecast coverage.</span>
            </div>
            ${dateSelector}
          </div>
          ${renderResourceStatuses(resourceStatuses)}
        </div>
        ${forecastAvailable ? `
        <div class="row g-2">
          <div class="col-12">
            <span class="workflow-instruction chart-instruction">
              Click or tap a colored time window to view its conditions below.
            </span>
          </div>
          <div class="col-12 chart-legend-column">${legend}</div>
        </div>
        <div class="main-tide-chart-wrap">
          <canvas id="mainTideChart"></canvas>
        </div>
        ` : `
          <div class="assessment-unavailable" role="status">
            <strong>Complete assessment temporarily unavailable.</strong>
            <span>
              One or more required forecast resources did not respond.
              Please try again shortly.
            </span>
          </div>
        `}
      </div>
      ${forecastAvailable ? detailsShell : ''}
    `;
  }

  function renderLoadingAssessmentShell({
    dateSelector,
    legend,
    loadingChart,
    loadingDetails,
    location,
  }) {
    return `
      <div class="section mt-2 timing-chart-section">
        <div class="row g-2 assessment-header-row">
          <div class="col assessment-location-column">
            <div class="assessment-context">
              <div class="assessment-context-label">
                Dive conditions assessment for
              </div>
              <div class="location-title-row">
                <h1 class="dive-site">${location}, BC, Canada</h1>
                <button
                  class="header-location-link"
                  type="button"
                  disabled
                >
                  Change location
                </button>
              </div>
            </div>
          </div>
          <div class="col-auto assessment-temperature-column">
            <div class="facts">
              <div class="fact">
                <div class="fact-label">Water</div>
                <div
                  id="waterTemperatureValue"
                  class="fact-value temperature-value skeleton-line skeleton-fact-value"
                ></div>
              </div>
            </div>
          </div>
        </div>
        <strong class="timing-header">
          When do conditions look most suitable?
        </strong>
        <div class="forecast-controls">
          <div class="forecast-date-control">
            <div class="workflow-instruction date-instruction-line">
              <strong>Select a date.</strong>
              <span>Dates shown have full current forecast coverage.</span>
            </div>
            ${dateSelector}
          </div>
          ${renderResourceStatuses([
            { resource: 'Weather', source: 'Open-Meteo', status: 'loading' },
            {
              resource: 'Tides',
              source: 'CHS tide station',
              status: 'loading',
            },
            {
              resource: 'Currents',
              source: 'UBC SalishSeaCast',
              status: 'loading',
            },
          ])}
        </div>
        <div class="row g-2">
          <div class="col-12">
            <span class="workflow-instruction chart-instruction">
              Click or tap a colored time window to view its conditions below.
            </span>
          </div>
          <div class="col-12 chart-legend-column">${legend}</div>
        </div>
        ${loadingChart}
      </div>
      ${loadingDetails}
    `;
  }

  return {
    renderChartLegend,
    renderForecastDateSelector,
    renderResourceStatuses,
    renderForecastPanel,
    renderLoadingChart,
    renderLoadingAssessmentShell,
    renderLoadingDetails,
    renderLocationPanel,
    renderLoadedDetailsShell,
    renderLoadedAssessmentShell,
    renderSafetyDisclaimer,
    renderSelectedWindowPanel,
  };
});
