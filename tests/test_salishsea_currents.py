import unittest
from datetime import date
from unittest.mock import Mock, patch

from salishsea_currents import (
    currents_for_local_date,
    fetch_salishsea_currents,
    resolve_nearest_water_cell,
)


SAMPLE_CSV = """time,gridY,gridX,VelEast5,VelNorth5
UTC,count,count,m/s,m/s
2026-07-29T18:30:00Z,479,328,0.10,0.20
2026-07-29T19:30:00Z,479,328,0.01,0.01
2026-07-29T20:30:00Z,479,328,-0.10,-0.20
"""


class SalishSeaCurrentTests(unittest.TestCase):
    def tearDown(self):
        resolve_nearest_water_cell.cache_clear()

    @patch("salishsea_currents.requests.get")
    def test_resolves_nearest_wet_grid_cell(self, request_get):
        response = Mock(text="""time,gridY,gridX,glamt,gphit,tmaskutil
UTC,count,count,degrees_east,degrees_north,
2007-01-01T00:30:00Z,479,327,-123.2968,49.3714,1
2007-01-01T00:30:00Z,479,328,-123.2916,49.3733,1
2007-01-01T00:30:00Z,479,329,-123.2864,49.3752,0
""")
        response.raise_for_status.return_value = None
        request_get.return_value = response

        cell = resolve_nearest_water_cell(
            49.3729,
            -123.2909,
            479,
            328,
            2,
        )

        self.assertEqual((cell["grid_y"], cell["grid_x"]), (479, 328))
        self.assertLess(cell["distance_km"], 0.1)
        self.assertIn("tmaskutil[0][477:1:481][326:1:330]", request_get.call_args.kwargs["params"])

    @patch("salishsea_currents.requests.get")
    def test_fetches_vectors_and_estimates_directional_reversal_time(
        self,
        request_get,
    ):
        response = Mock(text=SAMPLE_CSV)
        response.raise_for_status.return_value = None
        request_get.return_value = response

        points = fetch_salishsea_currents(479, 328)

        self.assertEqual(len(points), 3)
        self.assertAlmostEqual(points[0]["speed"], 0.43)
        self.assertIsNone(points[1]["qualifier"])
        self.assertEqual(points[2]["qualifier"], "ESTIMATED_REVERSAL")
        self.assertIn("2026-07-29T19:", points[2]["event_time"])
        self.assertIn("VelEast5[last-71:1:last][479][328]", request_get.call_args.args[0] + "?" + request_get.call_args.kwargs["params"])

    @patch("salishsea_currents.requests.get")
    def test_does_not_call_small_same_direction_fluctuations_reversals(
        self,
        request_get,
    ):
        response = Mock(text="""time,gridY,gridX,VelEast5,VelNorth5
UTC,count,count,m/s,m/s
2026-07-30T16:30:00Z,479,328,0.01,-0.30
2026-07-30T17:30:00Z,479,328,0.05,-0.23
2026-07-30T18:30:00Z,479,328,0.07,-0.26
""")
        response.raise_for_status.return_value = None
        request_get.return_value = response

        points = fetch_salishsea_currents(479, 328)

        self.assertEqual(
            [point["qualifier"] for point in points],
            [None, None, None],
        )

    @patch("salishsea_currents.requests.get")
    def test_marks_only_one_minimum_in_a_continuous_low_current_window(
        self,
        request_get,
    ):
        response = Mock(text="""time,gridY,gridX,VelEast5,VelNorth5
UTC,count,count,m/s,m/s
2026-07-30T12:30:00Z,479,328,0.05,-0.18
2026-07-30T13:30:00Z,479,328,0.02,-0.10
2026-07-30T14:30:00Z,479,328,0.01,-0.14
""")
        response.raise_for_status.return_value = None
        request_get.return_value = response

        points = fetch_salishsea_currents(479, 328)

        self.assertEqual(
            [point["qualifier"] for point in points],
            [None, "LOW_CURRENT_MINIMUM", None],
        )

    def test_filters_utc_model_points_to_vancouver_calendar_date(self):
        points = [
            {"time": "2026-07-29T06:30:00Z", "speed": 0.2},
            {"time": "2026-07-29T07:30:00Z", "speed": 0.3},
            {"time": "2026-07-30T06:30:00Z", "speed": 0.4},
        ]

        selected = currents_for_local_date(points, date(2026, 7, 29))

        self.assertEqual(
            [point["speed"] for point in selected],
            [0.3, 0.4],
        )


if __name__ == "__main__":
    unittest.main()
