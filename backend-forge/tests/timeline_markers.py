import unittest

from integration import request, token


class TimelineMarkers(unittest.TestCase):
    def setUp(self) -> None:
        self.auth = token()

    def create(self, **fields: object) -> dict:
        payload = dict(period="2026", title="Marker parity", org="Test", description="", **fields)
        status, entry, _ = request("POST", "/api/admin/timeline", payload, self.auth)
        self.assertEqual(status, 201, entry)
        self.addCleanup(request, "DELETE", f"/api/admin/timeline/{entry['id']}", None, self.auth)
        return entry

    def test_allowed_colors_and_omitted_update(self) -> None:
        for color in ("default", "gold", "silver", "bronze"):
            with self.subTest(color=color):
                entry = self.create(**({} if color == "default" else {"marker_color": color}))
                self.assertEqual(entry["marker_color"], color)
                path = f"/api/admin/timeline/{entry['id']}"
                status, updated, _ = request("PUT", path, {"title": "Updated marker"}, self.auth)
                self.assertEqual(status, 200, updated)
                self.assertEqual(updated["marker_color"], color)
                for listing, auth in (("/api/timeline", None), ("/api/admin/timeline", self.auth)):
                    status, rows, _ = request("GET", listing, auth=auth)
                    self.assertEqual(status, 200, rows)
                    self.assertEqual(next(row for row in rows if row["id"] == entry["id"])["marker_color"], color)
                status, updated, _ = request("PUT", path, {"marker_color": "default"}, self.auth)
                self.assertEqual(status, 200, updated)
                self.assertEqual(updated["marker_color"], "default")

    def test_invalid_colors_rejected_on_create_and_update(self) -> None:
        entry = self.create(marker_color="gold")
        for color in ("", "platinum", "Gold", "#ff0000", None, 1, [], {}):
            with self.subTest(color=color):
                payload = dict(period="2026", title="Invalid marker", org="Test", description="", marker_color=color)
                status, body, _ = request("POST", "/api/admin/timeline", payload, self.auth)
                self.assertEqual(status, 400, body)
                status, body, _ = request("PUT", f"/api/admin/timeline/{entry['id']}", {"marker_color": color}, self.auth)
                self.assertEqual(status, 200 if color is None else 400, body)
                if color is None:
                    self.assertEqual(body["marker_color"], "gold")


if __name__ == "__main__":
    unittest.main()
