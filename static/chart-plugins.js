(function exposeChartPlugins(root, factory) {
  const chartPlugins = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = chartPlugins;
  } else {
    root.ChartPlugins = chartPlugins;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  function registerDiveChartPlugins({
    Chart,
    colors,
    interpolateY,
    sameRange,
  }) {
    const nowMarker = {
      id: 'nowMarker',
      afterDatasetsDraw(chart, args, options) {
        const index = options.index;
        if (index < 0 && options.xValue === undefined) return;
        const { ctx, chartArea, scales } = chart;
        let x;
        let y;

        if (options.xValue !== undefined && scales.x) {
          x = scales.x.getPixelForValue(options.xValue);
          y =
            options.yValue !== undefined &&
            options.yValue !== null &&
            scales.y
              ? scales.y.getPixelForValue(options.yValue)
              : chartArea.top + (chartArea.bottom - chartArea.top) / 2;
        } else {
          const point = chart.getDatasetMeta(0).data[index];
          if (!point) return;
          ({ x, y } = point);
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = colors.red[700];
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors.nowMarker.fill;
        ctx.fill();
        ctx.font = '600 11px Arial';
        ctx.fillStyle = colors.red[700];
        ctx.fillText('Now', x + 6, chartArea.bottom - 12);
        ctx.restore();
      },
    };

    const slackMarkers = {
      id: 'slackMarkers',
      afterDatasetsDraw(chart, args, options) {
        if (!options?.points?.length) return;
        const { ctx, chartArea, scales } = chart;
        const tidePoints = chart.data.datasets[0].data;

        ctx.save();
        options.points.forEach((point) => {
          const x = scales.x.getPixelForValue(point.x);
          const tideY = interpolateY(tidePoints, point.x);
          const y =
            tideY !== null
              ? scales.y.getPixelForValue(tideY)
              : chartArea.top + 20;

          ctx.save();
          ctx.strokeStyle = colors.text.primary;
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = options.currentSpeedLineColor(0);
          ctx.fill();
          ctx.font = '600 11px Arial';
          ctx.fillStyle = colors.text.primary;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(point.label, x, chartArea.bottom + 14);
          ctx.fillText(
            options.formatTime(point.time),
            x,
            chartArea.bottom + 28,
          );
        });
        ctx.restore();
      },
    };

    const daylight = {
      id: 'daylight',
      beforeDatasetsDraw(chart, args, options) {
        if (!options) return;
        const { ctx, chartArea, scales } = chart;
        const sunriseX = scales.x.getPixelForValue(options.sunrise);
        const sunsetX = scales.x.getPixelForValue(options.sunset);
        const top = Math.max(0, chartArea.top - 42);
        const bottom = chartArea.bottom + 37;

        ctx.save();
        ctx.fillStyle = colors.chart.night;
        ctx.fillRect(
          chartArea.left,
          top,
          sunriseX - chartArea.left,
          bottom - top,
        );
        ctx.fillRect(
          sunsetX,
          top,
          chartArea.right - sunsetX,
          bottom - top,
        );
        ctx.restore();
      },
    };

    const sunriseSunset = {
      id: 'sunriseSunset',
      afterDraw(chart, args, options) {
        if (options?.sunrise === undefined || options?.sunset === undefined) {
          return;
        }
        const { ctx, chartArea, scales } = chart;

        [
          ['↑ Sunrise', options.sunrise, options.sunriseLabel],
          ['↓ Sunset', options.sunset, options.sunsetLabel],
        ].forEach(([label, value, time]) => {
          const x = scales.x.getPixelForValue(value);
          ctx.save();
          ctx.fillStyle = colors.text.primary;
          ctx.font = '600 11px Arial';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          const width = Math.max(
            ctx.measureText(label).width,
            ctx.measureText(time).width,
          );
          const centerX = Math.min(
            Math.max(x, chartArea.left + width / 2 + 4),
            chartArea.right - width / 2 - 4,
          );
          ctx.fillText(label, centerX, chartArea.top - 28);
          ctx.fillText(time, centerX, chartArea.top - 14);
          ctx.restore();
        });
      },
    };

    const tideHeightLabel = {
      id: 'tideHeightLabel',
      afterDraw(chart, args, options) {
        if (!options?.display) return;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.fillStyle = colors.text.secondary;
        ctx.font = '600 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(6, chartArea.top + (chartArea.bottom - chartArea.top) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(options.text || 'Tide height (m)', 0, 0);
        ctx.restore();
      },
    };

    const suitabilityWindows = {
      id: 'suitabilityWindows',
      beforeDatasetsDraw(chart, args, options) {
        if (!options?.windows?.length) return;
        const { ctx, chartArea, scales } = chart;
        ctx.save();
        options.windows.forEach((window) => {
          const start = scales.x.getPixelForValue(window.start);
          const end = scales.x.getPixelForValue(window.end);
          const hovered = sameRange(
            window,
            chart.$hoveredSuitabilityWindow,
          );
          const selected = sameRange(window, options.getSelectedWindow());
          ctx.fillStyle = window.fill;
          ctx.fillRect(
            start,
            chartArea.top,
            end - start,
            chartArea.bottom - chartArea.top,
          );
          if (hovered || selected) {
            ctx.strokeStyle = selected
              ? colors.text.primary
              : colors.text.secondary;
            ctx.lineWidth = selected ? 2 : 1;
            ctx.strokeRect(
              start + 1,
              chartArea.top + 1,
              end - start - 2,
              chartArea.bottom - chartArea.top - 2,
            );
          }
        });
        ctx.restore();
      },
    };

    const eventLabelBand = {
      id: 'eventLabelBand',
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const top = Math.max(0, chartArea.top - 42);
        const bottom = chartArea.bottom + 1;
        const height = 36;
        ctx.save();
        ctx.fillStyle = 'rgba(247, 250, 251, 0.96)';
        ctx.fillRect(
          chartArea.left,
          top,
          chartArea.right - chartArea.left,
          chartArea.top - top,
        );
        ctx.fillRect(
          chartArea.left,
          bottom,
          chartArea.right - chartArea.left,
          height,
        );
        ctx.strokeStyle = colors.border.muted;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 1;
        for (let hour = 0; hour <= 24; hour += 1) {
          const x = scales.x.getPixelForValue(hour);
          ctx.beginPath();
          ctx.moveTo(x, bottom);
          ctx.lineTo(x, bottom + height);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, bottom);
        ctx.lineTo(chartArea.right, bottom);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, chartArea.top);
        ctx.lineTo(chartArea.right, chartArea.top);
        ctx.stroke();
        ctx.restore();
      },
    };

    Chart.register(
      eventLabelBand,
      daylight,
      nowMarker,
      suitabilityWindows,
      slackMarkers,
      sunriseSunset,
      tideHeightLabel,
    );
  }

  return { registerDiveChartPlugins };
});
