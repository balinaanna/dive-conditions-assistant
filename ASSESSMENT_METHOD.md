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
| Data unavailable | 45 | Current data unavailable |
| Up to 0.35 kn | 78 | Near slack |
| Above 0.35 to 0.75 kn | 68 | Relatively mild |
| Above 0.75 to 1.50 kn | 45 | Requires caution |
| Above 1.50 kn | 20 | Strong |

## Slack and tide adjustment

An interval is considered close to slack when its midpoint is within 45 minutes
of the nearest predicted slack-current event.

- Slack near high tide adds 12 points.
- Slack near low tide adds 5 points.

High versus low tide is determined by comparing the tide event closest to the
slack event with the midpoint between the day's minimum and maximum predicted
tide-event heights.

This adjustment makes high-tide slack the most favorable current scenario while
still recognizing low-tide slack as an improvement.

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
- Current events and speeds: CHS First Narrows station.

The First Narrows current series is currently used as a regional proxy. It is
not a direct current measurement at Whytecliff Park. This limitation should be
considered when interpreting the assessment and should remain visible in
project documentation until a validated site-specific source or model replaces
it.

## Known limitations

- Forecasts can differ from actual site conditions.
- The model does not currently include waves, swell, visibility, water quality,
  vessel traffic, equipment, diver ability, or instructor judgment.
- Weather values are hourly and interpolated between forecast points.
- Predicted tide and current events are not real-time observations.
- A rating describes the configured forecast rules, not whether entering the
  water is safe.

