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

  return {
    createForecastChartRenderer,
  };
});
