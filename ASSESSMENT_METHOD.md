# Deterministic assessment method

## Scope

The widget estimates when forecast conditions may be more or less suitable for
freediving at Whytecliff Park. It is a comparison and planning aid, not a
real-time safety authority or a guarantee that a dive is safe.

The deployed assessment does not call an LLM. Given the same normalized input
data, it produces the same scores, ratings, windows, reasons, and
recommendations.

## Inputs

The assessment combines:

- predicted current events and speeds;
- predicted tide heights and high/low tide events;
- sunrise and sunset;
- hourly wind speed;
- hourly precipitation rate.

Water and air temperatures are displayed for context but do not currently
affect the rating.

## Sampling and time windows

1. The selected day is divided into 15-minute intervals.
2. Each interval is assessed at its midpoint.
3. Current, wind, and precipitation values are interpolated to that midpoint.
4. Adjacent intervals with the same rating are merged into one selectable time
   window.
5. The highest-scoring interval in a merged window supplies its representative
   time and key reason.

## Base current score

Current speed is treated as the primary factor. Absolute current speed sets the
starting score:

| Absolute current speed | Starting score | Interpretation |
| --- | ---: | --- |
| Data unavailable | 20 | Local current forecast unavailable |
| Up to 0.35 kn | 78 | Low modelled current |
| Above 0.35 to 0.75 kn | 68 | Relatively mild |
| Above 0.75 to 1.50 kn | 45 | Requires caution |
| Above 1.50 kn | 20 | Strong |

## Estimated reversal and tide adjustment

An interval is considered close to an estimated current reversal when its
midpoint is within 45 minutes of a direction-aware model event.

- An estimated reversal near high tide adds 12 points.
- An estimated reversal near low tide adds 5 points.

High versus low tide is determined by comparing the tide event closest to the
estimated reversal with the midpoint between the day's minimum and maximum
predicted tide-event heights.

Low speed by itself does not create a reversal marker. The current vector must
change sign along the dominant flow axis, and its interpolated total speed at
that crossing must be no more than 0.5 kn. Events less than three hours apart
are deduplicated. Because the source is hourly model output, these are
approximate reversal times rather than official slack-current predictions.

The chart also marks the lowest hourly value in each continuous period at or
below 0.35 kn as **Slack**. This preserves useful slack-like timing at
locations where the modelled current rotates or retains a background flow
instead of reversing cleanly. A minimum-current marker does not receive the
reversal score adjustment.

## Wind adjustment

Wind is secondary to current:

| Wind speed | Risk label | Score adjustment |
| --- | --- | ---: |
| Up to 12 km/h | Low | 0 |
| Above 12 to 20 km/h | Medium | -4 |
| Above 20 km/h | High | -10 |

## Precipitation adjustment

Precipitation has the smallest influence:

| Precipitation rate | Risk label | Score adjustment |
| --- | --- | ---: |
| Up to 0.5 mm/h | Low | 0 |
| Above 0.5 to 4 mm/h | Medium | -3 |
| Above 4 mm/h | High | -6 |

## Daylight rule

Any interval before sunrise or at or after sunset receives a score of 0 and is
rated **Not recommended**, regardless of the other inputs.

## Rating thresholds

| Final score | Displayed rating |
| ---: | --- |
| 88 or higher | Ideal |
| 68–87 | Good |
| 40–67 | Use caution |
| Below 40 | Not recommended |

## Selected-window factor summaries

The details panel summarizes the complete selected window rather than only its
representative interval:

- **Current speed:** shows a minimum–maximum range when the difference exceeds
  0.05 kn. Its factor verdict is based on the predominant risk across all
  15-minute samples, so a brief peak does not automatically define a long
  window.
- **Wind:** shows a range when the difference exceeds 0.5 km/h. Its factor
  verdict uses the maximum wind within the window.
- **Precipitation:** shows the estimated total across the window and identifies
  the highest sampled hourly rate and its approximate time. Its factor verdict
  uses that peak rate.

## Current data used by this version

- Tide curve and high/low events: CHS Point Atkinson station.
- Current vectors: UBC SalishSeaCast dataset
  `ubcSSfDepthAvgdCurrents1h`.
- Model grid location: nearest wet cell found in the SalishSeaCast
  `ubcSSn2DMeshMaskV21-08` dataset around the configured Whytecliff grid seed.
- Model values: hourly eastward and northward velocity components averaged
  over the upper five model levels, nominally five metres.

The application interpolates the eastward and northward components separately
to each 15-minute assessment time, then calculates vector magnitude and
converts metres per second to knots. Estimated reversals are calculated from a
sign change along the rolling series' dominant flow axis. This prevents small
same-direction speed fluctuations from being mislabeled as slack.

Modelled reversal times are compared one-to-one with First Narrows CHS
slack-current events from the same local day. Agreement within 60 minutes is
high-confidence phase alignment; agreement within 120 minutes is medium
confidence; larger differences are low confidence. A missing or extra event
also makes the comparison divergent and low confidence. CHS values are not
treated as local Whytecliff measurements.

The current-provider fallback order is:

1. SalishSeaCast forecast.
2. CIOPS adapter (reserved but not yet configured).
3. First Narrows CHS event-based estimated curve, explicitly marked low
   confidence.
4. Current unavailable.

SalishSeaCast is a regional numerical model, not a measurement at the dive
entry. Its rolling forecast can provide only partial coverage on the third
displayed date. The application does not extrapolate model data across
uncovered periods. When the model has no usable series, provenance and
confidence identify whether the response came from the CHS fallback or is
unavailable.

## Known limitations

- Forecasts can differ from actual site conditions.
- The model does not currently include waves, swell, visibility, water quality,
  vessel traffic, equipment, diver ability, or instructor judgment.
- Weather values are hourly and interpolated between forecast points.
- Predicted tides and modelled currents are not real-time observations at the
  Whytecliff entry.
- Estimated current reversals are derived from hourly averaged model vectors;
  they should not be treated as precise slack-water predictions.
- A rating describes the configured forecast rules, not whether entering the
  water is safe.
