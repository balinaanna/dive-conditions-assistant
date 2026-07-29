const {
  SUITABILITY_SAMPLE_STEP_HOURS,
  buildSuitabilityWindows: calculateSuitabilityWindows,
  currentRiskForSpeed,
  getSlackPoints: getAssessmentSlackPoints,
  interpolateY,
  precipitationRiskForRate,
  predominantCurrentRisk,
  timeToDecimalHour,
  windRiskForSpeed,
} = window.AssessmentEngine;

const {
  cachedForecastBundle,
  loadForecastBundle,
  loadTemperatureSummary,
} = window.ForecastData.createForecastDataService();

const CSS = getComputedStyle(document.documentElement);

const COLORS = {
  chart: {
    night: CSS.getPropertyValue('--chart-night').trim(),
    sun: {
      sunrise: CSS.getPropertyValue('--sunrise').trim(),
      sunset: CSS.getPropertyValue('--sunset').trim(),
    },
  },
  condition: {
    ideal: CSS.getPropertyValue('--condition-ideal').trim(),
    ok: CSS.getPropertyValue('--condition-ok').trim(),
    notRecommended: CSS.getPropertyValue('--condition-not-recommended').trim(),
  },
  text: {
    primary: CSS.getPropertyValue('--text-primary').trim(),
    secondary: CSS.getPropertyValue('--text-secondary').trim(),
    strong: CSS.getPropertyValue('--text-strong').trim(),
  },
  border: {
    muted: CSS.getPropertyValue('--border-muted').trim(),
  },
  nowMarker: {
    fill: 'rgba(185, 28, 28, 0.45)',
  },
  red: {
    700: CSS.getPropertyValue('--red-700').trim(),
    500: CSS.getPropertyValue('--red-500').trim(),
    300: CSS.getPropertyValue('--red-300').trim(),
    100: CSS.getPropertyValue('--red-100').trim(),
  },
  green: {
    700: CSS.getPropertyValue('--green-700').trim(),
    500: CSS.getPropertyValue('--green-500').trim(),
    300: CSS.getPropertyValue('--green-300').trim(),
    100: CSS.getPropertyValue('--green-100').trim(),
  },
};

let selectedLocationId = 'whytecliff';

let selectedHourIndex = 0;
let selectedSuitabilityWindow = null;
let activeForecastChart = null;
let activeDetailsView = 'selected';
let conditionsRequestId = 0;

let chsCurrentSpeedData = null;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let selectedForecastDate = localDateString();

const CURRENT_SPEED_RANGE_DISPLAY_THRESHOLD_KN = 0.05;
const WIND_SPEED_RANGE_DISPLAY_THRESHOLD_KMH = 0.5;

function renderTemperatures(temperatures) {
  const waterValue = document.getElementById('waterTemperatureValue');

  if (!waterValue) return;

  waterValue.textContent = displayValue(temperatures.water_temp_c, '°C');
  waterValue.classList.remove('skeleton-line', 'skeleton-fact-value');
  waterValue.classList.add('fact-value');
}

function isTodaySelected() {
  return selectedForecastDate === localDateString();
}

function forecastDateOptions() {
  const today = new Date();

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

function renderForecastDateSelector() {
  return `
    <div class="forecast-date-selector" aria-label="Forecast date">
      ${forecastDateOptions()
        .map(
          (option) => `
            <button
              class="forecast-date-choice ${
                option.value === selectedForecastDate ? 'active' : ''
              }"
              type="button"
              aria-pressed="${
                option.value === selectedForecastDate ? 'true' : 'false'
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
            <span class="status-key-swatch ideal"></span>
            Ideal
          </span>
          <span class="status-key-item">
            <span class="status-key-swatch good"></span>
            Good
          </span>
          <span class="status-key-item">
            <span class="status-key-swatch caution"></span>
            Use caution
          </span>
          <span class="status-key-item">
            <span class="status-key-swatch bad"></span>
            Not recommended
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

function selectedLocationName() {
  return 'Whytecliff Park';
}

function renderConditionsLoadingState() {
  const section = document.getElementById('conditionsSection');
  section.classList.remove('loading-failed');
  section.innerHTML = `
    <div class="section mt-2 timing-chart-section">
      <div class="row g-2 assessment-header-row">
        <div class="col assessment-location-column">
          <div class="assessment-context">
            <div class="assessment-context-label">
              Dive conditions assessment for
            </div>
            <h1 class="dive-site">${selectedLocationName()}, BC, Canada</h1>
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

      <strong class="timing-header">When do conditions look most suitable?</strong>
      <div class="usage-instruction date-instruction">
        <strong>Select a date.</strong>
        Forecast is available for 7 days, starting today.
      </div>
      ${renderForecastDateSelector()}

      <div class="row g-2">
        <div class="col-12">
          <span class="usage-instruction chart-instruction">
            <strong>Click or tap a colored time window to view its conditions below.</strong>
          </span>
        </div>
        <div class="col-12 chart-legend-column">${renderChartLegend()}</div>
      </div>

      <div
        class="main-tide-chart-wrap loading-chart-placeholder"
        aria-label="Loading tide and assessment chart"
      >
        <div class="skeleton-chart-band"></div>
        <div class="skeleton-chart-grid"></div>
        <div class="skeleton-chart-axis"></div>
      </div>
    </div>

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

function renderConditionsErrorState() {
  renderConditionsLoadingState();

  const section = document.getElementById('conditionsSection');
  const chartPlaceholder = section.querySelector('.loading-chart-placeholder');

  section.classList.add('loading-failed');

  if (chartPlaceholder) {
    chartPlaceholder.insertAdjacentHTML(
      'beforeend',
      `
        <div class="conditions-loading-error" role="alert">
          Conditions could not be loaded. Please try again.
        </div>
      `,
    );
  }
}

function selectForecastDate(forecastDate) {
  if (forecastDate === selectedForecastDate) return;

  selectedForecastDate = forecastDate;
  selectedSuitabilityWindow = null;
  loadConditions(selectedLocationId, selectedForecastDate);
}

function formatTime12(timeString) {
  const hour = parseInt(timeString.slice(11, 13));
  const minute = timeString.slice(14, 16);
  const period = hour >= 12 ? 'PM' : 'AM';

  let displayHour = hour % 12;

  if (displayHour === 0) {
    displayHour = 12;
  }

  return `${displayHour}:${minute} ${period}`;
}

function formatHour12(timeString) {
  const hour = parseInt(timeString.slice(11, 13));
  const period = hour >= 12 ? 'PM' : 'AM';

  let displayHour = hour % 12;

  if (displayHour === 0) {
    displayHour = 12;
  }

  return `${displayHour}${period}`;
}

function formatDecimalTime(value) {
  const totalMinutes = Math.round(value * 60);
  const hour = ((Math.floor(totalMinutes / 60) % 24) + 24) % 24;
  const minute = totalMinutes % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatSuitabilityWindow(window) {
  if (!window) return '';
  return `${formatDecimalTime(window.start)} – ${formatDecimalTime(window.end)}`;
}

function logSuitabilityWindowCurrentSpeeds(windows) {
  console.group('Suitability windows — current speeds');

  windows.forEach((window) => {
    console.groupCollapsed(
      `${formatSuitabilityWindow(window)} · ${statusDisplayLabel(window.status)}`,
    );
    console.table(
      window.samples.map((sample) => ({
        time: formatDecimalTime(sample.time),
        current_speed_kn:
          sample.currentSpeed === null || sample.currentSpeed === undefined
            ? 'Unavailable'
            : Number(sample.currentSpeed.toFixed(3)),
        absolute_speed_kn:
          sample.currentSpeed === null || sample.currentSpeed === undefined
            ? 'Unavailable'
            : Number(Math.abs(sample.currentSpeed).toFixed(3)),
      })),
    );
    console.groupEnd();
  });

  console.groupEnd();
}

function getCurrentHourIndex(hours) {
  const now = new Date();
  const currentHour = now.getHours();

  return hours.findIndex((hour) => {
    const hourValue = parseInt(hour.time.slice(11, 13));
    return hourValue === currentHour;
  });
}

function getCurrentDecimalHour() {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

const forecastChartRenderer = window.ChartRenderer.createForecastChartRenderer({
  Chart,
  colors: COLORS,
  formatHour: formatHour12,
  getCurrentHourIndex,
  windRiskForSpeed,
});

const tideChartRenderer = window.ChartRenderer.createTideChartRenderer({
  Chart,
  colors: COLORS,
  formatLocalTime: formatLocalTime12,
  formatTime: formatTime12,
  getSelectedWindow: () => selectedSuitabilityWindow,
  interpolateY,
  onSelectWindow: selectSuitabilityWindow,
  sameRange: sameCurrentRange,
  timeToDecimalHour,
});

function sameCurrentRange(a, b) {
  if (!a || !b) return false;

  return (
    a.start === b.start && a.end === b.end && a.rangeClass === b.rangeClass
  );
}

const nowMarkerPlugin = {
  id: 'nowMarker',
  afterDatasetsDraw(chart, args, pluginOptions) {
    const index = pluginOptions.index;

    if (index < 0 && pluginOptions.xValue === undefined) return;

    const { ctx, chartArea, scales } = chart;

    let x;
    let y;

    if (pluginOptions.xValue !== undefined && scales.x) {
      x = scales.x.getPixelForValue(pluginOptions.xValue);

      if (
        pluginOptions.yValue !== undefined &&
        pluginOptions.yValue !== null &&
        scales.y
      ) {
        y = scales.y.getPixelForValue(pluginOptions.yValue);
      } else {
        y = chartArea.top + (chartArea.bottom - chartArea.top) / 2;
      }
    } else {
      const meta = chart.getDatasetMeta(0);
      const point = meta.data[index];

      if (!point) return;

      x = point.x;
      y = point.y;
    }

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.red[700];
    ctx.setLineDash([4, 4]);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.nowMarker.fill;
    ctx.fill();

    ctx.font = '600 11px Arial';
    ctx.fillStyle = COLORS.red[700];
    ctx.fillText('Now', x + 6, chartArea.bottom - 12);

    ctx.restore();
  },
};

const slackMarkersPlugin = {
  id: 'slackMarkers',

  afterDatasetsDraw(chart, args, pluginOptions) {
    if (!pluginOptions?.points?.length) return;

    const { ctx, chartArea, scales } = chart;
    const tidePoints = chart.data.datasets[0].data;

    ctx.save();

    pluginOptions.points.forEach((point) => {
      const x = scales.x.getPixelForValue(point.x);
      const tideY = interpolateY(tidePoints, point.x);
      const y =
        tideY !== null ? scales.y.getPixelForValue(tideY) : chartArea.top + 20;

      ctx.save();
      // ctx.globalAlpha = 0.8;
      ctx.strokeStyle = COLORS.text.primary;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = pluginOptions.currentSpeedLineColor(0);
      ctx.fill();

      ctx.font = '600 11px Arial';
      ctx.fillStyle = COLORS.text.primary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText('Slack', x, chartArea.bottom + 14);
      ctx.fillText(
        pluginOptions.formatTime(point.time),
        x,
        chartArea.bottom + 28,
      );
    });

    ctx.restore();
  },
};

const daylightPlugin = {
  id: 'daylight',

  beforeDatasetsDraw(chart, args, pluginOptions) {
    if (!pluginOptions) return;

    const { ctx, chartArea, scales } = chart;
    const { sunrise, sunset } = pluginOptions;

    const sunriseX = scales.x.getPixelForValue(sunrise);
    const sunsetX = scales.x.getPixelForValue(sunset);
    const labelBandTop = Math.max(0, chartArea.top - 42);
    const labelBandBottom = chartArea.bottom + 37;

    ctx.save();

    ctx.fillStyle = COLORS.chart.night;

    // Before sunrise
    ctx.fillRect(
      chartArea.left,
      labelBandTop,
      sunriseX - chartArea.left,
      labelBandBottom - labelBandTop,
    );

    // After sunset
    ctx.fillRect(
      sunsetX,
      labelBandTop,
      chartArea.right - sunsetX,
      labelBandBottom - labelBandTop,
    );

    ctx.restore();
  },
};

const sunriseSunsetPlugin = {
  id: 'sunriseSunset',

  afterDraw(chart, args, pluginOptions) {
    if (
      pluginOptions?.sunrise === undefined ||
      pluginOptions?.sunset === undefined
    ) {
      return;
    }

    const { ctx, chartArea, scales } = chart;

    [
      {
        value: pluginOptions.sunrise,
        label: `↑ Sunrise ${pluginOptions.sunriseLabel}`,
        color: COLORS.chart.sun.sunrise,
      },
      {
        value: pluginOptions.sunset,
        label: `↓ Sunset ${pluginOptions.sunsetLabel}`,
        color: COLORS.chart.sun.sunset,
      },
    ].forEach((event) => {
      const x = scales.x.getPixelForValue(event.value);
      const eventName =
        event.value === pluginOptions.sunrise ? '↑ Sunrise' : '↓ Sunset';
      const timeLabel =
        event.value === pluginOptions.sunrise
          ? pluginOptions.sunriseLabel
          : pluginOptions.sunsetLabel;

      ctx.save();
      ctx.fillStyle = COLORS.text.primary;
      ctx.font = '600 11px Arial';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      const labelWidth = Math.max(
        ctx.measureText(eventName).width,
        ctx.measureText(timeLabel).width,
      );
      const centerX = Math.min(
        Math.max(x, chartArea.left + labelWidth / 2 + 4),
        chartArea.right - labelWidth / 2 - 4,
      );

      ctx.fillText(eventName, centerX, chartArea.top - 28);
      ctx.fillText(timeLabel, centerX, chartArea.top - 14);
      ctx.restore();
    });
  },
};

const tideHeightLabelPlugin = {
  id: 'tideHeightLabel',

  afterDraw(chart, args, pluginOptions) {
    if (!pluginOptions?.display) return;

    const { ctx, chartArea } = chart;

    ctx.save();
    ctx.fillStyle = COLORS.text.secondary;
    ctx.font = '600 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(6, chartArea.top + (chartArea.bottom - chartArea.top) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(pluginOptions.text || 'Tide height (m)', 0, 0);
    ctx.restore();
  },
};

const suitabilityWindowsPlugin = {
  id: 'suitabilityWindows',

  beforeDatasetsDraw(chart, args, pluginOptions) {
    if (!pluginOptions?.windows?.length) return;

    const { ctx, chartArea, scales } = chart;
    ctx.save();

    pluginOptions.windows.forEach((window) => {
      const xStart = scales.x.getPixelForValue(window.start);
      const xEnd = scales.x.getPixelForValue(window.end);
      const isHovered = sameCurrentRange(
        window,
        chart.$hoveredSuitabilityWindow,
      );
      const isSelected = sameCurrentRange(
        window,
        pluginOptions.getSelectedWindow(),
      );

      ctx.fillStyle = window.fill;
      ctx.fillRect(
        xStart,
        chartArea.top,
        xEnd - xStart,
        chartArea.bottom - chartArea.top,
      );

      if (isHovered || isSelected) {
        ctx.strokeStyle = isSelected
          ? COLORS.text.primary
          : COLORS.text.secondary;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(
          xStart + 1,
          chartArea.top + 1,
          xEnd - xStart - 2,
          chartArea.bottom - chartArea.top - 2,
        );
      }
    });

    ctx.restore();
  },
};

const eventLabelBandPlugin = {
  id: 'eventLabelBand',

  beforeDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    const topBandTop = Math.max(0, chartArea.top - 42);
    const bandTop = chartArea.bottom + 1;
    const bandHeight = 36;

    ctx.save();
    ctx.fillStyle = 'rgba(247, 250, 251, 0.96)';
    ctx.fillRect(
      chartArea.left,
      topBandTop,
      chartArea.right - chartArea.left,
      chartArea.top - topBandTop,
    );
    ctx.fillRect(
      chartArea.left,
      bandTop,
      chartArea.right - chartArea.left,
      bandHeight,
    );

    ctx.strokeStyle = COLORS.border.muted;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1;

    for (let hour = 0; hour <= 24; hour += 1) {
      const x = scales.x.getPixelForValue(hour);

      ctx.beginPath();
      ctx.moveTo(x, bandTop);
      ctx.lineTo(x, bandTop + bandHeight);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.border.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, bandTop);
    ctx.lineTo(chartArea.right, bandTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chartArea.left, chartArea.top);
    ctx.lineTo(chartArea.right, chartArea.top);
    ctx.stroke();
    ctx.restore();
  },
};

Chart.register(
  eventLabelBandPlugin,
  daylightPlugin,
  nowMarkerPlugin,
  suitabilityWindowsPlugin,
  slackMarkersPlugin,
  sunriseSunsetPlugin,
  tideHeightLabelPlugin,
);

let selectedHours = [];
let appData = null;

function displayValue(value, unit = '') {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return `${value}${unit}`;
}

function selectHour(index) {
  selectedHourIndex = index;
  renderSelectedHourPanel();
}

function nearestHourIndex(decimalHour) {
  return selectedHours.reduce((bestIndex, hour, index) => {
    const hourX = timeToDecimalHour(hour.time);
    const bestX = timeToDecimalHour(selectedHours[bestIndex].time);

    return Math.abs(hourX - decimalHour) < Math.abs(bestX - decimalHour)
      ? index
      : bestIndex;
  }, 0);
}

function selectSuitabilityWindow(window, preferredTime = null) {
  const sampleTime =
    preferredTime === null
      ? window.representativeTime
      : Math.min(Math.max(preferredTime, window.start), window.end);
  const nearestSample = window.samples?.reduce((best, sample) => {
    if (!best) return sample;
    return Math.abs(sample.time - sampleTime) < Math.abs(best.time - sampleTime)
      ? sample
      : best;
  }, null);

  selectedSuitabilityWindow = nearestSample
    ? {
        ...window,
        ...nearestSample,
        representativeTime: nearestSample.time,
      }
    : window;

  selectedHourIndex = nearestHourIndex(sampleTime);
  renderSelectedHourPanel();
}

function renderSelectedHourPanel() {
  const panel = document.getElementById('selectedHourDetails');
  if (!panel) return;

  panel.innerHTML = `
    ${renderSelectedHourDetails(selectedHourIndex)}
    ${renderSafetyDisclaimer()}
  `;
}

let mainTideChart = null;

function renderMainTideChart(data) {
  if (mainTideChart) {
    mainTideChart.destroy();
    mainTideChart = null;
  }

  if (!data.tides?.curve?.length) return;

  mainTideChart = drawTideChart(data, 'mainTideChart');
}

function drawTideChart(data, canvasId = 'tideChart') {
  return tideChartRenderer.drawTideChart({
    canvas: document.getElementById(canvasId),
    currentDecimalHour: getCurrentDecimalHour(),
    currentSpeedData: chsCurrentSpeedData,
    data,
    showNow: isTodaySelected(),
    slackPoints: getSlackPoints(),
    suitabilityWindows: buildSuitabilityWindows(data.hourly_forecast),
  });
}

function riskBadgeClass(risk) {
  if (risk === 'high') return 'risk-high';
  if (risk === 'medium') return 'risk-medium';
  if (risk === 'low') return 'risk-low';
  return 'risk-unknown';
}

function statusBadgeClass(status) {
  if (status === 'Ideal') return 'status-ideal';
  if (status === 'Good') return 'status-good';
  if (status === 'Ok') return 'status-ok';
  return 'status-not-recommended';
}

function statusDisplayLabel(status) {
  if (status === 'Ideal') return 'Ideal';
  if (status === 'Good') return 'Good';
  if (status === 'Ok') return 'Use caution';
  return 'Not recommended';
}

function renderFactorCard(label, value, risk, state, role) {
  return `
    <div class="factor-card factor-card-${risk}">
      <span class="factor-label">${label}</span>
      <div class="factor-value-row">
        <span class="risk-dot ${riskBadgeClass(risk)}"></span>
        <strong>${value}</strong>
      </div>
      <div class="factor-meaning">
        <span class="factor-state factor-state-${risk}">${state}</span>
        <span class="factor-role">${role}</span>
      </div>
    </div>
  `;
}

function renderSelectedHourDetails(index) {
  const hour = selectedHours[index];

  if (!hour) return '';

  const status = selectedSuitabilityWindow?.status || 'Not Recommended';
  const explanation =
    selectedSuitabilityWindow?.reason ||
    'A detailed assessment is unavailable for this window.';
  const windowSpeed = selectedSuitabilityWindow?.currentSpeed;
  const windowWind = selectedSuitabilityWindow?.wind;
  const windowRain = selectedSuitabilityWindow?.rain;
  const windowCurrentSpeeds = (selectedSuitabilityWindow?.samples || [])
    .map((sample) => sample.currentSpeed)
    .filter((speed) => speed !== null && speed !== undefined)
    .map((speed) => Math.abs(speed));
  const minimumWindowSpeed = windowCurrentSpeeds.length
    ? Math.min(...windowCurrentSpeeds)
    : windowSpeed === null || windowSpeed === undefined
      ? null
      : Math.abs(windowSpeed);
  const maximumWindowSpeed = windowCurrentSpeeds.length
    ? Math.max(...windowCurrentSpeeds)
    : windowSpeed === null || windowSpeed === undefined
      ? null
      : Math.abs(windowSpeed);
  const currentValue =
    minimumWindowSpeed === null || maximumWindowSpeed === null
      ? 'Unavailable'
      : maximumWindowSpeed - minimumWindowSpeed >
          CURRENT_SPEED_RANGE_DISPLAY_THRESHOLD_KN
        ? `${minimumWindowSpeed.toFixed(2)} – ${maximumWindowSpeed.toFixed(2)} kn`
        : `${((minimumWindowSpeed + maximumWindowSpeed) / 2).toFixed(2)} kn`;
  const peakCurrentRisk = currentRiskForSpeed(maximumWindowSpeed);
  const currentRisk = predominantCurrentRisk(
    windowCurrentSpeeds,
    maximumWindowSpeed === null ? 'unknown' : peakCurrentRisk,
  );
  const windowWindSpeeds =
    selectedSuitabilityWindow?.samples
      ?.map((sample) => sample.wind)
      .filter((wind) => wind !== null && wind !== undefined) || [];
  const minimumWindowWind = windowWindSpeeds.length
    ? Math.min(...windowWindSpeeds)
    : (windowWind ?? null);
  const maximumWindowWind = windowWindSpeeds.length
    ? Math.max(...windowWindSpeeds)
    : (windowWind ?? null);
  const formattedWindValue =
    minimumWindowWind === null || maximumWindowWind === null
      ? hour.wind_kmh
      : maximumWindowWind - minimumWindowWind >
          WIND_SPEED_RANGE_DISPLAY_THRESHOLD_KMH
        ? `${minimumWindowWind.toFixed(1)} – ${maximumWindowWind.toFixed(1)}`
        : ((minimumWindowWind + maximumWindowWind) / 2).toFixed(1);
  const windRisk =
    maximumWindowWind === null
      ? windRiskForSpeed(hour.wind_kmh)
      : windRiskForSpeed(maximumWindowWind);
  const windowRainSamples =
    selectedSuitabilityWindow?.samples?.filter(
      (sample) => sample.rain !== null && sample.rain !== undefined,
    ) || [];
  const totalWindowRain = windowRainSamples.length
    ? windowRainSamples.reduce(
        (total, rain) => total + rain.rain * SUITABILITY_SAMPLE_STEP_HOURS,
        0,
      )
    : null;
  const peakWindowRainSample = windowRainSamples.reduce(
    (peak, sample) =>
      peak === null || sample.rain > peak.rain ? sample : peak,
    null,
  );
  const maximumWindowRain = peakWindowRainSample?.rain ?? windowRain ?? null;
  const rainValue =
    totalWindowRain === null
      ? hour.precipitation_mm
      : totalWindowRain.toFixed(1);
  const rainRisk =
    maximumWindowRain === null
      ? precipitationRiskForRate(hour.precipitation_mm)
      : precipitationRiskForRate(maximumWindowRain);
  const currentState =
    currentRisk === 'high'
      ? 'Strong'
      : currentRisk === 'medium'
        ? 'Moderate'
        : maximumWindowSpeed !== null && maximumWindowSpeed <= 0.35
          ? 'Slack'
          : currentRisk === 'low'
            ? 'Mild'
            : 'Unknown';
  const windState =
    windRisk === 'high'
      ? 'Strong'
      : windRisk === 'medium'
        ? 'Moderate'
        : windRisk === 'low'
          ? 'Light'
          : 'Unknown';
  const rainNumeric =
    maximumWindowRain === null ? hour.precipitation_mm : maximumWindowRain;
  const rainState =
    rainRisk === 'high'
      ? 'Heavy'
      : rainRisk === 'medium'
        ? 'Moderate'
        : rainNumeric > 0.05
          ? 'Light'
          : rainRisk === 'low'
            ? 'None'
            : 'Unknown';
  const factorRole = (risk) =>
    risk === 'high'
      ? 'Primary concern'
      : risk === 'medium'
        ? 'Needs attention'
        : risk === 'low'
          ? 'Favorable'
          : 'Not available';
  const currentRole =
    maximumWindowSpeed !== null &&
    peakCurrentRisk !== 'unknown' &&
    peakCurrentRisk !== currentRisk
      ? `Peaks at ${maximumWindowSpeed.toFixed(2)} kn`
      : factorRole(currentRisk);
  const primaryAction =
    status === 'Not Recommended'
      ? 'Choose a different time window.'
      : status === 'Ideal'
        ? 'This is one of the best forecast windows.'
        : status === 'Good'
          ? 'Conditions look good for this window.'
          : 'Use this window with caution.';

  return `
    <div class="assessment-content-grid">
      <div class="assessment-decision">
        <div class="assessment-overview ${statusBadgeClass(status)}-overview">
          <div class="assessment-window-label">Selected window</div>
          <div class="assessment-title-row">
            <div class="details-time">${formatSuitabilityWindow(selectedSuitabilityWindow)} Conditions</div>
            <span class="status-chip ${statusBadgeClass(status)}">
              ${statusDisplayLabel(status)}
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
        ${renderFactorCard(
          'Current speed',
          currentValue,
          currentRisk,
          currentState,
          currentRole,
        )}
        ${renderFactorCard(
          'Wind',
          `${formattedWindValue} km/h`,
          windRisk,
          windState,
          factorRole(windRisk),
        )}
        ${renderFactorCard(
          'Precipitation',
          `${rainValue} mm total`,
          rainRisk,
          rainState,
          maximumWindowRain !== null && maximumWindowRain <= 0.05
            ? 'No precipitation expected'
            : peakWindowRainSample
              ? `Peak: ${maximumWindowRain.toFixed(1)} mm/h around ${formatDecimalTime(
                  Math.round(peakWindowRainSample.time * 4) / 4,
                )}`
              : maximumWindowRain === null
                ? 'Peak unavailable'
                : `Peak: ${maximumWindowRain.toFixed(1)} mm/h`,
        )}
      </div>
    </div>
  `;
}

function renderForecastCharts() {
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

function renderMainPanel() {
  const panel = document.getElementById('mainPanelContent');

  if (!panel) return;

  if (activeForecastChart) {
    activeForecastChart.destroy();
    activeForecastChart = null;
  }

  panel.innerHTML =
    activeDetailsView === 'forecast' ? renderForecastCharts() : '';

  if (activeDetailsView === 'forecast') {
    showForecastChart('wind');
  }
}

function setDetailsView(viewName) {
  activeDetailsView = viewName;

  document.querySelectorAll('.bottom-view-tab').forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.details-view-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.view === viewName);
  });

  renderMainPanel();
}

function showForecastChart(panelName) {
  if (!appData) return;

  document.querySelectorAll('.forecast-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.chart === panelName);
  });

  if (activeForecastChart) {
    activeForecastChart.destroy();
    activeForecastChart = null;
  }

  const panel = document.querySelector('.forecast-chart-wrap');

  if (!panel) return;

  panel.innerHTML = `<canvas id="forecastChart"></canvas>`;

  const chartMap = {
    wind: ['wind_kmh', 'Wind', 'km/h'],
    rain: ['precipitation_mm', 'Precipitation', 'mm'],
    air: ['air_temp_c', 'Air temperature', '°C'],
  };

  if (chartMap[panelName]) {
    const [metric, label, unit] = chartMap[panelName];

    activeForecastChart = forecastChartRenderer.drawForecastChart({
      canvas: document.getElementById('forecastChart'),
      metric,
      label,
      unit,
      data: appData,
      showNow: isTodaySelected(),
    });

    return;
  }
}

function loadConditions(locationId, forecastDate = selectedForecastDate) {
  selectedLocationId = locationId;
  selectedForecastDate = forecastDate;
  selectedSuitabilityWindow = null;
  activeDetailsView = 'selected';
  const requestId = ++conditionsRequestId;
  const cached = cachedForecastBundle(locationId, forecastDate);

  if (!cached) {
    renderConditionsLoadingState();
    loadTemperatureSummary(locationId, forecastDate)
      .then((temperatures) => {
        if (requestId !== conditionsRequestId) return;
        renderTemperatures(temperatures);
      })
      .catch((error) => {
        console.warn('Failed to load temperatures early:', error);
      });
  }

  loadForecastBundle(locationId, forecastDate)
    .then((bundle) => {
      if (requestId !== conditionsRequestId) return;

      const data = bundle.conditions;
      const hours = data.hourly_forecast;
      chsCurrentSpeedData = bundle.currentSpeed;
      appData = data;
      selectedHours = hours;
      selectedForecastDate = data.daily.date;

      document.getElementById('conditionsSection').innerHTML = `
        <div class="section mt-2 timing-chart-section">
          <div class="row g-2 assessment-header-row">
            <div class="col assessment-location-column">
              <div class="assessment-context">
                <div class="assessment-context-label">
                  Dive conditions assessment for
                </div>
                <h1 class="dive-site">${data.location}, BC, Canada</h1>
              </div>
            </div>

            <div class="col-auto assessment-temperature-column">
              <div class="facts">
                <div class="fact">
                  <div class="fact-label">Water</div>
                  <div class="fact-value">${displayValue(data.current.water_temp_c, '°C')}</div>
                </div>

              </div>
            </div>
          </div>

          <strong class="timing-header">When do conditions look most suitable?</strong>
          <div class="usage-instruction date-instruction">
            <strong>Select a date.</strong>
            Forecast is available for 7 days, starting today.
          </div>
          ${renderForecastDateSelector()}

          <div class="row g-2">
            <div class="col-12">
              <span class="usage-instruction chart-instruction">
                <strong>Click or tap a colored time window to view its conditions below.</strong>
              </span>
            </div>
            <div class="col-12 chart-legend-column">
              ${renderChartLegend()}
            </div>
          </div>

          <div class="main-tide-chart-wrap">
            <canvas id="mainTideChart"></canvas>
          </div>
        </div>

        <div class="section details-view-section">
          <div class="details-view-content">
            <div
              class="details-view-panel active"
              data-view="selected"
            >
              <div
                id="selectedHourDetails"
                class="selected-window-frame"
              ></div>
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

      const initialWindows = buildSuitabilityWindows(hours);
      logSuitabilityWindowCurrentSpeeds(initialWindows);
      const now = isTodaySelected() ? getCurrentDecimalHour() : null;
      const initialWindow = isTodaySelected()
        ? initialWindows.find(
            (window) => now >= window.start && now < window.end,
          ) || initialWindows[0]
        : initialWindows.reduce(
            (best, window) =>
              !best || window.bestScore > best.bestScore ? window : best,
            null,
          );

      if (initialWindow) {
        selectSuitabilityWindow(initialWindow, now);
      } else {
        selectHour(0);
      }
      renderMainPanel();

      setTimeout(() => {
        renderMainTideChart(data);
      }, 0);
    })
    .catch((error) => {
      if (requestId !== conditionsRequestId) return;

      console.error(error);
      renderConditionsErrorState();
    });
}

renderConditionsLoadingState();

loadConditions(selectedLocationId);

function formatLocalTime12(timeString) {
  return new Date(timeString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getSlackPoints() {
  return getAssessmentSlackPoints(chsCurrentSpeedData);
}

function suitabilityRangeFill(status) {
  if (status === 'Ideal') return 'rgba(55, 224, 108, 0.4)';
  if (status === 'Good') return 'rgba(79, 168, 214, 0.2)';
  if (status === 'Ok') return 'rgba(240, 172, 52, 0.18)';
  return 'rgba(220, 50, 75, 0.09)';
}

function buildSuitabilityWindows(hours) {
  return calculateSuitabilityWindows({
    hours,
    currentSpeedData: chsCurrentSpeedData,
    tides: appData?.tides,
    daily: appData?.daily,
  }).map((window) => ({
    ...window,
    fill: suitabilityRangeFill(window.status),
  }));
}

Object.assign(window, {
  selectForecastDate,
  setDetailsView,
  showForecastChart,
});
