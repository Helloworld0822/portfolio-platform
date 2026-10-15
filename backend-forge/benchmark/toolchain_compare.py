#!/usr/bin/env python3
"""Compare frozen old/new toolchains using isolated disposable application DBs."""
import argparse
import asyncio
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import statistics
import subprocess
import time

import aiohttp

ROOT = Path(__file__).resolve().parents[2]
LABEL = "portfolio.toolchain-benchmark"
PATHS = ["/api/health", "/api/posts", "/api/projects"]


def command(*args, data=None):
    return subprocess.check_output(list(args), input=data).decode().strip()


def save(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def percentile(values, fraction):
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)]


def stats(container):
    pid = command("docker", "inspect", "-f", "{{.State.Pid}}", container)
    relative = Path(f"/proc/{pid}/cgroup").read_text().split("0::", 1)[1].strip()
    return Path("/sys/fs/cgroup") / relative.lstrip("/")


def usage(group):
    cpu = dict(line.split() for line in (group / "cpu.stat").read_text().splitlines())
    return int(cpu["usage_usec"]), int((group / "memory.current").read_text())


def cores():
    found = {}
    for cpu in sorted(os.sched_getaffinity(0)):
        topology = Path(f"/sys/devices/system/cpu/cpu{cpu}/topology")
        key = ((topology / "physical_package_id").read_text(),
               (topology / "core_id").read_text())
        found.setdefault(key, cpu)
    return list(found.values())


async def trial(name, url, group, endpoint, clients, duration, expected, raw):
    rows = []
    active = peak = 0
    sampled_memory = []
    cpu_before, _ = usage(group)
    started = time.perf_counter_ns()
    deadline = time.monotonic() + duration
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(limit=clients),
                                    timeout=aiohttp.ClientTimeout(total=10),
                                    auto_decompress=False) as session:
        async def worker(identifier):
            nonlocal active, peak
            while time.monotonic() < deadline:
                tick = time.perf_counter_ns()
                status = 0
                error = ""
                active += 1
                peak = max(peak, active)
                try:
                    async with session.get(url + endpoint, headers={"Accept-Encoding": "identity"}) as response:
                        status = response.status
                        data = await response.read()
                        if status != 200 or json.loads(data) != expected:
                            error = "status or JSON payload mismatch: " + hashlib.sha256(data).hexdigest()
                except Exception as exception:
                    error = repr(exception)
                finally:
                    active -= 1
                rows.append((identifier, time.perf_counter_ns() - tick, status, error))

        async def memory():
            while time.monotonic() < deadline:
                sampled_memory.append(usage(group)[1])
                await asyncio.sleep(min(.2, max(0, deadline - time.monotonic())))

        await asyncio.gather(*(worker(i) for i in range(clients)), memory())
    elapsed = time.perf_counter_ns() - started
    cpu_after, memory_after = usage(group)
    sampled_memory.append(memory_after)
    with gzip.open(raw, "xt") as stream:
        json.dump({"columns": ["worker", "latency_ns", "status", "error"], "rows": rows}, stream)
    latencies = [row[1] for row in rows]
    errors = sum(bool(row[3]) for row in rows)
    return dict(variant=name, endpoint=endpoint, clients=clients, elapsed_ns=elapsed,
                requests=len(rows), errors=errors, rps=(len(rows) - errors) * 1e9 / elapsed,
                p50_ms=percentile(latencies, .5) / 1e6,
                p95_ms=percentile(latencies, .95) / 1e6,
                p99_ms=percentile(latencies, .99) / 1e6,
                cpu_core_percent=(cpu_after - cpu_before) * 1e5 / elapsed,
                sampled_cgroup_memory_mib=max(sampled_memory) / 1024 ** 2,
                peak_client_inflight=peak, samples=str(raw), samples_sha256=digest(raw))


def interval(values):
    rng = random.Random(20261015)
    samples = sorted(statistics.median(rng.choices(values, k=len(values))) for _ in range(10000))
    return [samples[249], samples[9749]]


def markdown(report, output):
    lines = ["# Portfolio application: pinned Forge toolchain update", "",
             f'The same committed Forge application, PostgreSQL/web modules, -O2 C policy and disposable DB fixtures are compared using the old monolithic toolchain and the new compiler/runtime/stdlib bundle. {report["config"]["pairs"]} balanced before/after pairs per row, {report["config"]["seconds"]:g} seconds measured after {report["config"]["warmup"]:g}-second prewarm; all attempts and errors are retained. CPU, network, load generator and database conditions are in JSON.', "",
             "| API | Configured clients | Before req/s | After req/s | Paired after/before (95% interval) | Before p99 ms | After p99 ms | Errors before/after |",
             "| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |"]
    summary = []
    for endpoint in PATHS:
        for clients in report["config"]["clients"]:
            groups = {name: [t for t in report["trials"] if t["phase"] == "measured"
                            and t["endpoint"] == endpoint and t["clients"] == clients
                            and t["variant"] == name] for name in ("before", "after")}
            before, after = groups["before"], groups["after"]
            if len(before) != report["config"]["pairs"] or len(after) != len(before):
                continue
            paired = [a["rps"] / b["rps"] for a, b in zip(after, before)]
            ci = interval(paired)
            med = lambda values, key: statistics.median(row[key] for row in values)
            lines.append(f'| {endpoint} | {clients} | {med(before,"rps"):.1f} | {med(after,"rps"):.1f} | {statistics.median(paired):.3f} [{ci[0]:.3f}, {ci[1]:.3f}] | {med(before,"p99_ms"):.2f} | {med(after,"p99_ms"):.2f} | {sum(t["errors"] for t in before)}/{sum(t["errors"] for t in after)} |')
            summary.append(dict(endpoint=endpoint, clients=clients, paired_ratio=statistics.median(paired),
                                ci95=ci, after_all_trials_slo=all(t["errors"] == 0 and t["p99_ms"] <= 1000 for t in after)))
    report["summary"] = summary
    lines += ["", "Configured clients and peak client in-flight operations are closed-loop observer counts, not a census of simultaneous TCP sockets or users. The server's connection limit is 256. A tested concurrency passing p99 <= 1 second and zero errors is a finite SLO observation; it is not the absolute maximum user population.", "",
              f'The single aiohttp observer decodes and compares the full JSON payload on every request. These client costs, synchronous native PostgreSQL/libmicrohttpd behavior and active production services on the shared host limit interpretation. Rust and the language\'s native epoll benchmark are not controls in this application comparison. No Rust 110% claim follows from these results. Intervals are individual bootstrap paired-median intervals from {report["config"]["pairs"]} pairs, not family-wise guarantees or universal language speedups.', "",
              "Every prewarm and measured latency/status/error sample is retained. Trial throughput counts successful requests over the actual elapsed interval including draining requests past the dispatch deadline, session close, JSON validation and memory sampling; later gzip sample writing is excluded. CPU is cgroup usage divided by wall time, where 100% is one core. Memory is sampled cgroup usage including native libraries and page caches, not allocated heap. Fixtures, image IDs, toolchain lock, source hashes and raw-file hashes are in JSON.", "",
              "This run uses only uniquely labeled disposable containers and tmpfs databases, publishes random loopback ports, never reads .env and removes only resources it creates. Frontend E2E, if requested, runs before fixture reset and timing; the frontend container is then stopped. No production deployment is performed.", ""]
    output.with_suffix(".md").write_text("\n".join(lines))


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before-image", default="portfolio-forge-before:toolchain-20261015")
    parser.add_argument("--after-image", default="portfolio-forge-after:toolchain-20261015")
    parser.add_argument("--frontend-image")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pairs", type=int, default=6)
    parser.add_argument("--seconds", type=float, default=3)
    parser.add_argument("--warmup", type=float, default=1)
    parser.add_argument("--clients", type=int, nargs="+", default=[1, 16, 64, 256])
    args = parser.parse_args()
    if args.pairs < 4 or args.pairs % 2 or not 0 < args.seconds <= 60 or not 0 <= args.warmup <= 10 or len(set(args.clients)) != len(args.clients) or any(not 1 <= n <= 256 for n in args.clients):
        parser.error("Even pairs >=4, bounded durations and clients 1..256 required")
    raw = args.output.with_suffix(".raw")
    if args.output.exists() or raw.exists():
        parser.error("Choose a fresh output; existing evidence is never replaced")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    raw.mkdir()
    cpu = cores()
    if len(cpu) < 5:
        parser.error("Five available physical cores are required")
    token = f"{int(time.time())}-{os.getpid()}"
    network = "portfolio-tc-" + token
    containers = []
    report = dict(status="running", protocol="portfolio-toolchain-v1", started_utc=datetime.now(timezone.utc).isoformat(),
                  config={**vars(args), "output": str(args.output)}, host=platform.platform(),
                  aiohttp=aiohttp.__version__, source_revision=command("env", "GIT_MASTER=1", "git", "rev-parse", "HEAD"),
                  toolchain=json.loads((ROOT / "backend-forge/toolchain/lock.json").read_text()),
                  server_cpus=cpu[:2], db_cpus=cpu[2:4], observer_cpu=cpu[4], trials=[], fixtures={})
    report["source_sha256"] = {str(path.relative_to(ROOT)): digest(path) for path in [
        *sorted((ROOT / "backend-forge/src").glob("*.fg")), ROOT / "backend-forge/native/adapter.c", Path(__file__)]}
    report["images"] = {name: command("docker", "image", "inspect", "-f", "{{.Id}}", image)
                        for name, image in [("before", args.before_image), ("after", args.after_image)]}
    old_affinity = os.sched_getaffinity(0)
    command("docker", "network", "create", "--label", f"{LABEL}={token}", network)
    try:
        def start(name, image, *options):
            container = network + "-" + name
            command("docker", "run", "-d", "--name", container, "--network", network,
                    "--label", f"{LABEL}={token}", *options, image)
            containers.append(container)
            return container

        db = start("db", "postgres:16-alpine", "--cpuset-cpus", ",".join(map(str, cpu[2:4])),
                   "--memory", "512m", "--tmpfs", "/var/lib/postgresql/data:rw,size=256m",
                   "-e", "POSTGRES_USER=bench", "-e", "POSTGRES_PASSWORD=benchmark-only", "-e", "POSTGRES_DB=before_db")
        for attempt in range(60):
            if subprocess.run(["docker", "exec", db, "pg_isready", "-h", "127.0.0.1", "-U", "bench", "-d", "before_db"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            await asyncio.sleep(1)
        else:
            raise RuntimeError("Disposable PostgreSQL readiness failed")
        command("docker", "exec", db, "createdb", "-U", "bench", "after_db")
        servers = {}
        async with aiohttp.ClientSession() as session:
            for name, image in [("before", args.before_image), ("after", args.after_image)]:
                container = start(name, image, "--no-healthcheck", "--network-alias", "api" if name == "after" else "before-api",
                                  "--cpuset-cpus", ",".join(map(str, cpu[:2])), "--memory", "512m", "-p", "127.0.0.1::8080",
                                  "-e", f"DATABASE_URL=postgres://bench:benchmark-only@{db}/{name}_db",
                                  "-e", "DATABASE_POOL_SIZE=5", "-e", "JWT_SECRET=benchmark-only-test-secret",
                                  "-e", "ADMIN_GITHUB_USERNAME=Helloworld0822", "-e", "GITHUB_CLIENT_ID=test",
                                  "-e", "GITHUB_CLIENT_SECRET=test", "-e", "HOST=0.0.0.0", "-e", "PORT=8080")
                url = "http://" + command("docker", "port", container, "8080/tcp")
                for attempt in range(60):
                    try:
                        async with session.get(url + "/api/health", timeout=aiohttp.ClientTimeout(total=1)) as response:
                            if response.status == 200:
                                break
                    except (aiohttp.ClientError, asyncio.TimeoutError):
                        pass
                    await asyncio.sleep(1)
                else:
                    raise RuntimeError("Disposable application readiness failed: " + container)
                if command("docker", "inspect", "-f", '{{index .Config.Labels "' + LABEL + '"}}', container) != token:
                    raise RuntimeError("Disposable container label mismatch")
                servers[name] = (url, stats(container))
            sql = """TRUNCATE comments,posts RESTART IDENTITY CASCADE;
INSERT INTO posts(title,content_markdown,excerpt,published,created_at,updated_at)
SELECT 'Post '||i,repeat('Benchmark body. ',20),'Same fixture',true,
'2026-01-01'::timestamptz+i*interval '1 second','2026-01-01'::timestamptz FROM generate_series(1,100)i;
"""
            def seed():
                for name in servers:
                    command("docker", "exec", "-i", db, "psql", "-U", "bench", "-d", name + "_db", "-v", "ON_ERROR_STOP=1", data=sql.encode())
                copied = command("docker", "exec", db, "pg_dump", "-U", "bench", "-d", "before_db", "--data-only", "--table=projects", "--table=timeline_entries")
                command("docker", "exec", db, "psql", "-U", "bench", "-d", "after_db", "-c", "TRUNCATE projects,timeline_entries CASCADE")
                command("docker", "exec", "-i", db, "psql", "-U", "bench", "-d", "after_db", "-v", "ON_ERROR_STOP=1", data=copied.encode())
            seed()
            if args.frontend_image:
                frontend = start("frontend", args.frontend_image, "-p", "127.0.0.1::80")
                frontend_url = "http://" + command("docker", "port", frontend, "80/tcp")
                result = subprocess.run(["npm", "test", "--prefix", "frontend-forge"], cwd=ROOT,
                                        env={**os.environ, "FORGE_FRONTEND_URL": frontend_url}, capture_output=True, text=True)
                (raw / "frontend-e2e.log").write_text(result.stdout + result.stderr)
                report["frontend_e2e_exit"] = result.returncode
                command("docker", "stop", frontend)
                result.check_returncode()
                seed()
            for endpoint in PATHS:
                values = []
                for url, _ in servers.values():
                    async with session.get(url + endpoint) as response:
                        if response.status != 200:
                            raise RuntimeError("Fixture probe failed")
                        values.append(await response.json())
                if values[0] != values[1]:
                    raise RuntimeError("Toolchain update changed JSON payload: " + endpoint)
                report["fixtures"][endpoint] = values[0]
        save(args.output, report)
        os.sched_setaffinity(0, [cpu[4]])
        for endpoint in PATHS:
            for clients in args.clients:
                orders = [["before", "after"], ["after", "before"]] * (args.pairs // 2)
                random.Random(20261015 + clients).shuffle(orders)
                for pair, order in enumerate(orders):
                    for name in order:
                        for phase, duration in [("prewarm", args.warmup), ("measured", args.seconds)]:
                            if duration == 0:
                                continue
                            prefix = f'{endpoint.rsplit("/",1)[1]}-{clients}-{pair}-{name}-{phase}'
                            row = await trial(name, *servers[name], endpoint, clients, duration,
                                              report["fixtures"][endpoint], raw / (prefix + ".json.gz"))
                            row.update(pair=pair, order=order, phase=phase)
                            report["trials"].append(row)
                            save(args.output, report)
                            print(prefix, round(row["rps"], 1), "req/s", row["errors"], "errors", flush=True)
        report["status"] = "completed" if all(t["errors"] == 0 for t in report["trials"]) else "completed_with_errors"
    except BaseException as error:
        report.update(status="failed_no_claim", error=repr(error))
        raise
    finally:
        os.sched_setaffinity(0, old_affinity)
        report["ended_utc"] = datetime.now(timezone.utc).isoformat()
        for container in containers:
            logs = subprocess.run(["docker", "logs", container], capture_output=True, text=True)
            (raw / (container + ".log")).write_text(logs.stdout + logs.stderr)
            subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["docker", "network", "rm", network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        markdown(report, args.output)
        save(args.output, report)


if __name__ == "__main__":
    asyncio.run(main())
