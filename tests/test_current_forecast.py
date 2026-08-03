import unittest
from datetime import date
from unittest.mock import patch
from zoneinfo import ZoneInfo

import requests

from current_forecast import build_current_forecast, compare_chs_phase


LOCAL_TIMEZONE = ZoneInfo("America/Vancouver")
FORECAST_DATE = date(2026, 7, 29)
LOCATION = {
    "name": "Whytecliff Park",
    "latitude": 49.3729,
    "longitude": -123.2909,
    "current_model": {
        "seed_grid_y": 479,
        "seed_grid_x": 328,
        "search_radius": 4,
    },
}


class CurrentForecastTests(unittest.TestCase):
    def test_compares_model_reversal_with_chs_slack(self):
        model = [{
            "time": "2026-07-29T18:30:00Z",
            "event_time": "2026-07-29T18:45:00Z",
            "qualifier": "ESTIMATED_REVERSAL",
        }]
        chs = [{
            "time": "2026-07-29T19:15:00Z",
            "qualifier": "SLACK",
            "speed": 0,
        }]

        comparison = compare_chs_phase(model, chs)

        self.assertEqual(comparison["status"], "aligned")
        self.assertEqual(comparison["confidence"], "high")
        self.assertEqual(comparison["max_delta_minutes"], 30)

    def test_mismatched_event_counts_are_divergent(self):
        model = [
            {
                "time": "2026-07-29T10:00:00Z",
                "event_time": "2026-07-29T10:00:00Z",
                "qualifier": "ESTIMATED_REVERSAL",
            },
            {
                "time": "2026-07-29T16:00:00Z",
                "event_time": "2026-07-29T16:00:00Z",
                "qualifier": "ESTIMATED_REVERSAL",
            },
        ]
        chs = [
            {"time": "2026-07-29T10:30:00Z", "qualifier": "SLACK"},
            {"time": "2026-07-29T16:30:00Z", "qualifier": "SLACK"},
            {"time": "2026-07-29T22:30:00Z", "qualifier": "SLACK"},
        ]

        comparison = compare_chs_phase(model, chs)

        self.assertEqual(comparison["status"], "divergent")
        self.assertEqual(comparison["confidence"], "low")
        self.assertEqual(comparison["model_reversal_count"], 2)
        self.assertEqual(comparison["chs_slack_count"], 3)
        self.assertEqual(
            comparison["unmatched_chs_times"],
            ["2026-07-29T22:30:00Z"],
        )

    def test_phase_comparison_excludes_adjacent_local_day_events(self):
        model = [{
            "time": "2026-07-29T18:30:00Z",
            "event_time": "2026-07-29T18:45:00Z",
            "qualifier": "ESTIMATED_REVERSAL",
        }]
        chs = [
            {"time": "2026-07-29T19:15:00Z", "qualifier": "SLACK"},
            {"time": "2026-07-30T08:00:00Z", "qualifier": "SLACK"},
        ]

        comparison = compare_chs_phase(
            model,
            chs,
            FORECAST_DATE,
            LOCAL_TIMEZONE,
        )

        self.assertEqual(comparison["status"], "aligned")
        self.assertEqual(comparison["chs_slack_count"], 1)

    @patch("current_forecast.fetch_salishsea_currents")
    @patch("current_forecast.resolve_nearest_water_cell")
    @patch("current_forecast.fetch_chs_current_events")
    def test_selects_salishseacast_and_includes_chs_phase_confidence(
        self,
        fetch_chs,
        resolve_cell,
        fetch_model,
    ):
        fetch_chs.return_value = [{
            "time": "2026-07-29T19:00:00Z",
            "qualifier": "SLACK",
            "speed": 0,
        }]
        resolve_cell.return_value = {
            "grid_y": 479,
            "grid_x": 328,
            "latitude": 49.3733,
            "longitude": -123.2916,
            "distance_km": 0.07,
        }
        fetch_model.return_value = [
            {
                "time": f"2026-07-29T{hour:02d}:30:00Z",
                "speed": 0.2,
                "qualifier": "ESTIMATED_REVERSAL" if hour == 19 else None,
                **({"event_time": "2026-07-29T19:15:00Z"} if hour == 19 else {}),
            }
            for hour in range(7, 24)
        ] + [
            {
                "time": f"2026-07-30T{hour:02d}:30:00Z",
                "speed": 0.2,
                "qualifier": None,
            }
            for hour in range(0, 7)
        ]

        payload = build_current_forecast(
            LOCATION,
            FORECAST_DATE,
            LOCAL_TIMEZONE,
        )

        self.assertEqual(payload["provider"], "salishseacast")
        self.assertEqual(payload["confidence"], "high")
        self.assertEqual(payload["phase_comparison"]["status"], "aligned")
        self.assertEqual(
            payload["fully_available_dates"],
            ["2026-07-29"],
        )
        self.assertEqual(payload["provider_attempts"][-1]["status"], "selected")

    @patch("current_forecast.fetch_salishsea_currents")
    @patch("current_forecast.resolve_nearest_water_cell")
    @patch("current_forecast.fetch_chs_current_events")
    def test_falls_back_to_chs_event_curve(
        self,
        fetch_chs,
        resolve_cell,
        fetch_model,
    ):
        fetch_chs.return_value = [
            {
                "time": "2026-07-29T15:00:00Z",
                "qualifier": "SLACK",
                "speed": 0,
            },
            {
                "time": "2026-07-29T18:00:00Z",
                "qualifier": "EXTREMA_FLOOD",
                "speed": 2.1,
            },
        ]
        resolve_cell.return_value = {
            "grid_y": 479,
            "grid_x": 328,
            "distance_km": 0.1,
        }
        fetch_model.side_effect = requests.Timeout("model unavailable")

        payload = build_current_forecast(
            LOCATION,
            FORECAST_DATE,
            LOCAL_TIMEZONE,
        )

        self.assertEqual(payload["provider"], "chs_estimate")
        self.assertEqual(payload["confidence"], "low")
        self.assertEqual(len(payload["points"]), 2)
        self.assertEqual(
            [attempt["provider"] for attempt in payload["provider_attempts"]],
            ["salishseacast", "ciops", "chs_estimate"],
        )

    @patch("current_forecast.fetch_salishsea_currents")
    @patch("current_forecast.resolve_nearest_water_cell")
    @patch("current_forecast.fetch_chs_current_events")
    def test_returns_explicit_unavailable_payload(
        self,
        fetch_chs,
        resolve_cell,
        fetch_model,
    ):
        fetch_chs.side_effect = requests.Timeout("CHS unavailable")
        resolve_cell.return_value = {"grid_y": 479, "grid_x": 328}
        fetch_model.side_effect = requests.Timeout("model unavailable")

        payload = build_current_forecast(
            LOCATION,
            FORECAST_DATE,
            LOCAL_TIMEZONE,
        )

        self.assertEqual(payload["provider"], "unavailable")
        self.assertEqual(payload["points"], [])
        self.assertFalse(payload["coverage"]["available"])


if __name__ == "__main__":
    unittest.main()
