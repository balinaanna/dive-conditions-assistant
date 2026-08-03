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

const {
  displayValue,
  formatDecimalTime,
  formatHour12,
  formatSuitabilityWindow,
  formatTime12,
} = window.ConditionFormatters;

const {
  numericValues,
  precipitationSummary,
  range: metricRange,
} = window.ConditionMetrics;

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

let currentSpeedData = null;

const widgetController = window.WidgetController.createWidgetController();
const { localDateString } = window.WidgetController;
let selectedForecastDate = widgetController.selectedDate;

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
  return widgetController.forecastDateOptions();
}

function renderForecastDateSelector() {
  return window.DiveViews.renderForecastDateSelector(
    forecastDateOptions(),
    selectedForecastDate,
  );
}

function renderChartLegend() {
  return window.DiveViews.renderChartLegend();
}

function selectedLocationName() {
  return 'Whytecliff Park';
}

function renderConditionsLoadingState() {
  const section = document.getElementById('conditionsSection');
  section.classList.remove('loading-failed');
  section.innerHTML = window.DiveViews.renderLoadingAssessmentShell({
    dateSelector: renderForecastDateSelector(),
    legend: renderChartLegend(),
    loadingChart: window.DiveViews.renderLoadingChart(),
    loadingDetails: window.DiveViews.renderLoadingDetails(),
    location: selectedLocationName(),
  });
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
  if (!widgetController.selectDate(forecastDate)) return;

  selectedForecastDate = widgetController.selectedDate;
  selectedSuitabilityWindow = null;
  loadConditions(selectedLocationId, selectedForecastDate);
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

window.ChartPlugins.registerDiveChartPlugins({
  Chart,
  colors: COLORS,
  interpolateY,
  sameRange: sameCurrentRange,
});

let selectedHours = [];
let appData = null;

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
  setDetailsView('selected');
  renderSelectedHourPanel();
}

function renderSelectedHourPanel() {
  const panel = document.getElementById('selectedHourDetails');
  if (!panel) return;

  panel.innerHTML = renderSelectedHourDetails(selectedHourIndex);
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
    currentSpeedData,
    data,
    showNow: isTodaySelected(),
    slackPoints: getSlackPoints(),
    suitabilityWindows: buildSuitabilityWindows(data.hourly_forecast),
  });
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
  const windowCurrentSpeeds = numericValues(
    selectedSuitabilityWindow?.samples,
    'currentSpeed',
    { absolute: true },
  );
  const currentFallback =
    windowSpeed === null || windowSpeed === undefined
      ? null
      : Math.abs(windowSpeed);
  const {
    minimum: minimumWindowSpeed,
    maximum: maximumWindowSpeed,
  } = metricRange(windowCurrentSpeeds, currentFallback);
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
  const windowWindSpeeds = numericValues(
    selectedSuitabilityWindow?.samples,
    'wind',
  );
  const {
    minimum: minimumWindowWind,
    maximum: maximumWindowWind,
  } = metricRange(windowWindSpeeds, windowWind ?? null);
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
  const {
    total: totalWindowRain,
    peak: maximumWindowRain,
    peakSample: peakWindowRainSample,
  } = precipitationSummary(
    selectedSuitabilityWindow?.samples,
    SUITABILITY_SAMPLE_STEP_HOURS,
    windowRain ?? null,
  );
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

  const precipitationRole =
    maximumWindowRain !== null && maximumWindowRain <= 0.05
      ? 'No precipitation expected'
      : peakWindowRainSample
        ? `Peak: ${maximumWindowRain.toFixed(1)} mm/h around ${formatDecimalTime(
            Math.round(peakWindowRainSample.time * 4) / 4,
          )}`
        : maximumWindowRain === null
          ? 'Peak unavailable'
          : `Peak: ${maximumWindowRain.toFixed(1)} mm/h`;

  return window.DiveViews.renderSelectedWindowPanel({
    explanation,
    primaryAction,
    status,
    windowLabel: formatSuitabilityWindow(selectedSuitabilityWindow),
    factors: [
      {
        label: 'Current speed',
        value: currentValue,
        risk: currentRisk,
        state: currentState,
        role: currentRole,
      },
      {
        label: 'Wind',
        value: `${formattedWindValue} km/h`,
        risk: windRisk,
        state: windState,
        role: factorRole(windRisk),
      },
      {
        label: 'Precipitation',
        value: `${rainValue} mm total`,
        risk: rainRisk,
        state: rainState,
        role: precipitationRole,
      },
    ],
  });
}

function renderForecastCharts() {
  return window.DiveViews.renderForecastPanel();
}

function renderMainPanel() {
  const panel = document.getElementById('mainPanelContent');

  if (!panel) return;

  if (activeForecastChart) {
    activeForecastChart.destroy();
    activeForecastChart = null;
  }

  panel.innerHTML =
    widgetController.activeView === 'forecast' ? renderForecastCharts() : '';

  if (widgetController.activeView === 'forecast') {
    showForecastChart('wind');
  }
}

function setDetailsView(viewName) {
  if (!widgetController.selectView(viewName)) return;

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
  widgetController.selectView('selected');
  const requestId = widgetController.beginRequest();
  const cached = cachedForecastBundle(locationId, forecastDate);

  if (!cached) {
    renderConditionsLoadingState();
    loadTemperatureSummary(locationId, forecastDate)
      .then((temperatures) => {
        if (!widgetController.isCurrentRequest(requestId)) return;
        renderTemperatures(temperatures);
      })
      .catch((error) => {
        console.warn('Failed to load temperatures early:', error);
      });
  }

  loadForecastBundle(locationId, forecastDate)
    .then((bundle) => {
      if (!widgetController.isCurrentRequest(requestId)) return;

      const data = bundle.conditions;
      const hours = data.hourly_forecast;
      currentSpeedData = bundle.currentSpeed;
      widgetController.setAvailableForecastDates(
        currentSpeedData?.fully_available_dates,
      );
      appData = data;
      selectedHours = hours;
      selectedForecastDate = data.daily.date;

      const currentSource = [
        currentSpeedData?.source,
        currentSpeedData?.depth_average,
      ].filter(Boolean).join(', ') || 'Unavailable';
      const currentNotes = [];
      if (currentSpeedData?.provider === 'chs_estimate') {
        currentNotes.push('Using the low-confidence CHS event-curve fallback.');
      } else if (currentSpeedData?.provider === 'unavailable') {
        currentNotes.push('No current forecast is available for this date.');
      }
      if (currentSpeedData?.coverage?.partial_day) {
        currentNotes.push(
          'Coverage is partial; uncovered periods are marked not recommended.',
        );
      }
      if (currentSpeedData?.confidence) {
        currentNotes.push(`Confidence: ${currentSpeedData.confidence}.`);
      }
      const phaseStatus = currentSpeedData?.phase_comparison?.status;
      const modelReversalCount =
        currentSpeedData?.phase_comparison?.model_reversal_count;
      const chsSlackCount = currentSpeedData?.phase_comparison?.chs_slack_count;
      if (
        Number.isInteger(modelReversalCount) &&
        Number.isInteger(chsSlackCount) &&
        modelReversalCount !== chsSlackCount
      ) {
        currentNotes.push(
          `Model found ${modelReversalCount} reversals; ` +
          `CHS reference has ${chsSlackCount} slack events.`,
        );
      }
      if (
        phaseStatus &&
        !['fallback_source', 'not_comparable', 'unavailable'].includes(
          phaseStatus,
        )
      ) {
        currentNotes.push(
          `CHS phase comparison: ${phaseStatus.replaceAll('_', ' ')}.`,
        );
      }

      document.getElementById('conditionsSection').innerHTML =
        window.DiveViews.renderLoadedAssessmentShell({
          dateSelector: renderForecastDateSelector(),
          detailsShell: window.DiveViews.renderLoadedDetailsShell(),
          legend: renderChartLegend(),
          location: data.location,
          currentSource,
          currentCoverageNote: currentNotes.join(' '),
          waterTemperature: displayValue(data.current.water_temp_c, '°C'),
        });

      const initialWindows = buildSuitabilityWindows(hours);
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
      if (!widgetController.isCurrentRequest(requestId)) return;

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
  return getAssessmentSlackPoints(currentSpeedData);
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
    currentSpeedData,
    tides: appData?.tides,
    daily: appData?.daily,
  }).map((window) => ({
    ...window,
    fill: suitabilityRangeFill(window.status),
  }));
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;

  if (button.matches('.forecast-date-choice[data-forecast-date]')) {
    selectForecastDate(button.dataset.forecastDate);
    return;
  }

  if (button.matches('.forecast-tab[data-chart]')) {
    showForecastChart(button.dataset.chart);
    return;
  }

  if (button.matches('.bottom-view-tab[data-view]')) {
    setDetailsView(button.dataset.view);
  }
});
