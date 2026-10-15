#!/usr/bin/env python3
import asyncio
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import toolchain_compare as benchmark


class ObserverTests(unittest.IsolatedAsyncioTestCase):
    async def observe(self, body, expected):
        async def serve(reader, writer):
            try:
                await reader.readuntil(b"\r\n\r\n")
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: " + str(len(body)).encode()
                             + b"\r\nConnection: close\r\n\r\n" + body)
                await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()
        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        self.addAsyncCleanup(server.wait_closed)
        self.addCleanup(server.close)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        raw = Path(temporary.name) / "requests.json.gz"
        port = server.sockets[0].getsockname()[1]
        with patch.object(benchmark, "usage", return_value=(0, 4096)):
            result = await benchmark.trial("test", f"http://127.0.0.1:{port}", Path("unused"),
                                           "/api/test", 2, .04, expected, raw)
        with gzip.open(raw, "rt") as stream:
            rows = json.load(stream)["rows"]
        return result, rows

    async def test_json_equivalence_and_complete_raw_rows(self):
        result, rows = await self.observe(b'{ "ok" : true }', {"ok": True})
        self.assertGreater(result["requests"], 0)
        self.assertEqual(len(rows), result["requests"])
        self.assertEqual(result["errors"], 0)
        self.assertTrue(all(row[2] == 200 and row[3] == "" for row in rows))
        self.assertLessEqual(result["peak_client_inflight"], 2)

    async def test_wrong_nonempty_200_payload_is_retained_as_error(self):
        result, rows = await self.observe(b'{"ok":false}', {"ok": True})
        self.assertGreater(result["requests"], 0)
        self.assertEqual(result["errors"], result["requests"])
        self.assertEqual(result["rps"], 0)
        self.assertTrue(all("payload mismatch" in row[3] for row in rows))

    def test_nearest_rank_percentile(self):
        self.assertEqual(benchmark.percentile(list(range(1, 101)), .99), 99)


if __name__ == "__main__":
    unittest.main(verbosity=2)
