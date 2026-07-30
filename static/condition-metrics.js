(function exposeConditionMetrics(root, factory) {
  const metrics = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = metrics;
  } else {
    root.ConditionMetrics = metrics;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  function numericValues(samples, field, { absolute = false } = {}) {
    return (samples || [])
      .map((sample) => sample[field])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => (absolute ? Math.abs(value) : value));
  }

  function range(values, fallback = null) {
    const available = values.length ? values : [];
    if (!available.length) {
      return { minimum: fallback, maximum: fallback };
    }
    return {
      minimum: Math.min(...available),
      maximum: Math.max(...available),
    };
  }

  function precipitationSummary(samples, sampleHours, fallback = null) {
    const available = (samples || []).filter(
      (sample) => sample.rain !== null && sample.rain !== undefined,
    );
    if (!available.length) {
      return { total: null, peak: fallback, peakSample: null };
    }
    const peakSample = available.reduce((peak, sample) =>
      !peak || sample.rain > peak.rain ? sample : peak,
    );
    return {
      total: available.reduce(
        (total, sample) => total + sample.rain * sampleHours,
        0,
      ),
      peak: peakSample.rain,
      peakSample,
    };
  }

  return { numericValues, precipitationSummary, range };
});
