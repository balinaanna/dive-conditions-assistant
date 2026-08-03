(function exposeChartRenderer(root, factory) {
  const chartRenderer = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = chartRenderer;
  } else {
    root.ChartRenderer = chartRenderer;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  function createForecastChartRenderer({
    Chart,
    colors,
    formatHour,
    getCurrentHourIndex,
    windRiskForSpeed,
  }) {
    function riskColor(risk) {
      if (risk === 'low') return colors.condition.ideal;
      if (risk === 'medium') return colors.condition.ok;
      if (risk === 'high') return colors.condition.notRecommended;
      return colors.border.muted;
    }

    function metricRisk(metric, value) {
      if (metric === 'wind_kmh') return windRiskForSpeed(value);
      return 'low';
    }

    function drawForecastChart({
      canvas,
      data,
      metric,
      label,
      unit,
      showNow,
    }) {
      const labels = data.hourly_forecast.map((hour) =>
        formatHour(hour.time),
      );
      const values = data.hourly_forecast.map((hour) => hour[metric]);
      const nowIndex = showNow
        ? getCurrentHourIndex(data.hourly_forecast)
        : -1;
      const pointColors = data.hourly_forecast.map((hour) =>
        riskColor(metricRisk(metric, hour[metric])),
      );

      return new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: `${label} (${unit})`,
              data: values,
              tension: 0.35,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: pointColors,
              pointBorderColor: pointColors,
              borderWidth: 2,
              segment: {
                borderColor: (context) => {
                  const index = context.p1DataIndex;
                  return riskColor(
                    metricRisk(
                      metric,
                      data.hourly_forecast[index][metric],
                    ),
                  );
                },
              },
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            nowMarker: {
              index: nowIndex,
            },
            tooltip: {
              callbacks: {
                title(context) {
                  return formatHour(
                    data.hourly_forecast[context[0].dataIndex].time,
                  );
                },
                label(context) {
                  return `${label}: ${context.raw} ${unit}`;
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: metric !== 'air_temp_c',
            },
          },
        },
      });
    }

    return {
      drawForecastChart,
    };
  }

  function createTideChartRenderer({
    Chart,
    colors,
    formatLocalTime,
    formatTime,
    getSelectedWindow,
    interpolateY,
    onSelectWindow,
    sameRange,
    timeToDecimalHour,
  }) {
    function currentSpeedLineColor(speed) {
      if (speed === null || speed === undefined) {
        return colors.border.muted;
      }

      const intensity = Math.min(Math.abs(speed) / 1.5, 1);
      const lightness = 52 - intensity * 30;
      return `hsl(140, 68%, ${lightness}%)`;
    }

    function decimalHourLabel(value) {
      const hour = ((Math.floor(value) % 24) + 24) % 24;
      const period = hour >= 12 ? 'PM' : 'AM';
      return `${hour % 12 || 12}${period}`;
    }

    function drawTideChart({
      canvas,
      currentDecimalHour,
      currentSpeedData,
      data,
      showNow,
      slackPoints,
      suitabilityWindows,
    }) {
      const sunrise = timeToDecimalHour(data.daily.sunrise);
      const sunset = timeToDecimalHour(data.daily.sunset);
      const currentSpeedPoints = (currentSpeedData?.points || [])
        .map((point) => ({
          x:
            (new Date(point.time) - new Date(currentSpeedData.start_time)) /
            (1000 * 60 * 60),
          y: point.speed,
          east: point.east_kn,
          north: point.north_kn,
        }))
        .sort((a, b) => a.x - b.x);
      const curvePoints = (data.tides.curve || []).map((point) => ({
        x: timeToDecimalHour(point.time),
        y: point.height_m,
      }));
      const nowY = showNow
        ? interpolateY(curvePoints, currentDecimalHour)
        : null;

      function currentSpeedAt(decimalHour) {
        const eastPoints = currentSpeedPoints
          .filter((point) => Number.isFinite(point.east))
          .map((point) => ({ x: point.x, y: point.east }));
        const northPoints = currentSpeedPoints
          .filter((point) => Number.isFinite(point.north))
          .map((point) => ({ x: point.x, y: point.north }));

        if (
          eastPoints.length === currentSpeedPoints.length &&
          northPoints.length === currentSpeedPoints.length
        ) {
          const east = interpolateY(eastPoints, decimalHour);
          const north = interpolateY(northPoints, decimalHour);
          if (east !== null && north !== null) return Math.hypot(east, north);
        }

        const interpolated = interpolateY(currentSpeedPoints, decimalHour);
        if (interpolated !== null) return Math.abs(interpolated);

        const nearest = currentSpeedPoints.reduce((best, point) => {
          if (!best) return point;
          return Math.abs(point.x - decimalHour) <
            Math.abs(best.x - decimalHour)
            ? point
            : best;
        }, null);

        return nearest && Math.abs(nearest.x - decimalHour) <= 0.75
          ? Math.abs(nearest.y)
          : null;
      }

      const chart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Tide height',
              data: curvePoints,
              parsing: false,
              tension: 0.35,
              pointRadius: 0,
              borderColor: colors.condition.ideal,
              backgroundColor: colors.condition.ideal,
              borderWidth: 2.5,
              segment: {
                borderColor: (context) => {
                  const midpoint = (context.p0.raw.x + context.p1.raw.x) / 2;
                  return currentSpeedLineColor(currentSpeedAt(midpoint));
                },
              },
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              top: 42,
              bottom: 0,
            },
          },
          onClick(event, elements, activeChart) {
            const xValue = activeChart.scales.x.getValueForPixel(event.x);
            const selectedWindow = suitabilityWindows.find(
              (window) => xValue >= window.start && xValue < window.end,
            );

            if (selectedWindow) {
              onSelectWindow(selectedWindow, xValue);
              activeChart.draw();
            }
          },
          onHover(event, elements, activeChart) {
            const xValue = activeChart.scales.x.getValueForPixel(event.x);
            const hoveredWindow = suitabilityWindows.find(
              (window) => xValue >= window.start && xValue <= window.end,
            );

            activeChart.canvas.style.cursor = hoveredWindow
              ? 'pointer'
              : 'default';

            if (
              !sameRange(
                activeChart.$hoveredSuitabilityWindow,
                hoveredWindow,
              )
            ) {
              activeChart.$hoveredSuitabilityWindow = hoveredWindow || null;
              activeChart.draw();
            }
          },
          plugins: {
            daylight: { sunrise, sunset },
            sunriseSunset: {
              sunrise,
              sunset,
              sunriseLabel: formatTime(data.daily.sunrise),
              sunsetLabel: formatTime(data.daily.sunset),
            },
            tideHeightLabel: {
              display: true,
              text: 'Tide height (m)',
            },
            suitabilityWindows: {
              windows: suitabilityWindows,
              getSelectedWindow,
            },
            legend: { display: false },
            nowMarker: showNow
              ? {
                  xValue: currentDecimalHour,
                  yValue: nowY,
                }
              : {
                  index: -1,
                },
            slackMarkers: {
              points: slackPoints,
              formatTime: formatLocalTime,
              currentSpeedLineColor,
            },
            tooltip: {
              callbacks: {
                title(context) {
                  return decimalHourLabel(context[0].raw.x);
                },
                label(context) {
                  return `Tide height: ${context.raw.y} m`;
                },
                labelColor(context) {
                  const color = currentSpeedLineColor(
                    currentSpeedAt(context.raw.x),
                  );
                  return {
                    borderColor: color,
                    backgroundColor: color,
                  };
                },
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: 24,
              afterFit(scale) {
                scale.paddingLeft = 0;
                scale.paddingRight = 0;
              },
              ticks: {
                stepSize: 1,
                padding: 36,
                align: 'inner',
                callback: decimalHourLabel,
              },
            },
            y: {
              afterFit(scale) {
                scale.width = 40;
              },
              title: { display: false },
              ticks: { padding: 0 },
            },
          },
        },
      });

      canvas.addEventListener('mousemove', (event) => {
        const { top, bottom } = chart.chartArea;
        const withinPlot = event.offsetY >= top && event.offsetY <= bottom;
        canvas.style.cursor = withinPlot ? 'pointer' : 'default';
      });

      canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
        chart.$hoveredSuitabilityWindow = null;
        chart.draw();
      });

      return chart;
    }

    return {
      drawTideChart,
    };
  }

  return {
    createForecastChartRenderer,
    createTideChartRenderer,
  };
});
