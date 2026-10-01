#!/usr/bin/env python3
"""Compare disposable Rust, baseline Forge and optimized Forge containers."""
import asyncio
import datetime
import importlib.util
import json
import os
import pathlib
import platform
import statistics
import time

import aiohttp

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('portfolio_compare', pathlib.Path(__file__).with_name('compare.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.SERVERS = {
    'rust': ('http://127.0.0.1:18111', 'forge-opt-rust'),
    'forge_before': ('http://127.0.0.1:18112', 'forge-opt-before'),
    'forge_after': ('http://127.0.0.1:18114', 'forge-opt-after'),
}
OUT = pathlib.Path(os.environ.get('OPTIMIZATION_OUTPUT', str(ROOT / 'docs/forge-optimization-performance.json')))
PATHS = ['/api/health', '/api/posts', '/api/projects']


def post_fixture(values):
    normalized = []
    for value in values:
        item = dict(value)
        item['created_at'] = datetime.datetime.fromisoformat(item['created_at'].replace('Z', '+00:00'))
        normalized.append(item)
    return sorted(normalized, key=lambda item: item['id'])


async def main():
    equivalent = {}
    async with aiohttp.ClientSession() as session:
        for path in PATHS:
            values = {}
            for name, (url, container) in base.SERVERS.items():
                label = base.docker('inspect', '-f', '{{index .Config.Labels "forge.optimization"}}', container)
                if label != '20261001':
                    raise RuntimeError('Benchmark only accepts explicitly labeled disposable containers')
                async with session.get(url + path) as response:
                    assert response.status == 200
                    values[name] = await response.json()
            assert values['forge_before'] == values['forge_after'], 'Forge payload changed: ' + path
            if path == '/api/posts':
                assert post_fixture(values['rust']) == post_fixture(values['forge_after']), 'Post fixture mismatch'
            equivalent[path] = {k: len(v) if isinstance(v, list) else v for k, v in values.items()}
    results = []
    names = list(base.SERVERS)
    for path in PATHS:
        for clients in [1, 16, 64]:
            for repeat in range(3):
                order = names[repeat:] + names[:repeat]
                for name in order:
                    await base.trial(name, path, clients, 1)
                    trial = await base.trial(name, path, clients, 5)
                    trial['repeat'] = repeat + 1
                    results.append(trial)
                    print(json.dumps(trial), flush=True)
    report = {
        'date_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'host': platform.platform(),
        'limits': {'cpus_per_server': 2, 'memory_mib_per_server': 512,
                   'pool_connections': 5, 'forge_workers': 8, 'repeats': 3,
                   'duration_seconds': 5, 'warmup_seconds': 1,
                   'fixture_posts': 100, 'encoding': 'identity',
                   'order': 'three-way rotation per repeat'},
        'baseline_forge_commit': '5546fdc',
        'equivalence': equivalent,
        'results': results,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + '\n')
    lines = ['# Forge optimization: Rust / before / after', '',
             'Three repeats of five seconds, one-second warmup, 2 CPUs / 512 MiB per server, '
             'five DB connections, identical disposable fixtures. Three-way rotated order. Values are medians.', '',
             '| API | Clients | Rust req/s | Before req/s | After req/s | After/before | After/Rust | Before p95 ms | After p95 ms | Errors |',
             '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for path in PATHS:
        for clients in [1, 16, 64]:
            grouped = {}
            for name in names:
                rows = [r for r in results if r['language'] == name and r['endpoint'] == path and r['concurrency'] == clients]
                grouped[name] = {key: statistics.median(r[key] for r in rows) for key in ['rps', 'p95_ms']}
            r, before, after = (grouped[n] for n in names)
            errors = sum(t['errors'] for t in results if t['endpoint'] == path and t['concurrency'] == clients)
            lines.append(f"| {path} | {clients} | {r['rps']:.2f} | {before['rps']:.2f} | {after['rps']:.2f} | {after['rps']/before['rps']:.2f}x | {after['rps']/r['rps']:.2f}x | {before['p95_ms']:.2f} | {after['p95_ms']:.2f} | {errors} |")
    lines += ['', 'The production applications remained running on this shared host. '
              'Small differences can be host variation. Different worker/runtime/libc and ban-cache '
              'implementations prevent interpreting this as a universal language comparison. '
              'The Forge scheduler is not on this libmicrohttpd server path. '
              'CPU and memory samples are included in the raw JSON.', '',
              'The Forge implementation retains PostgreSQL ban checks on every public request; '
              'the optimization releases DB leases before external HTTP and file work. '
              'A separate delayed-GitHub test covers the contention this change targets.']
    OUT.with_suffix('.md').write_text('\n'.join(lines) + '\n')
    if any(r['errors'] for r in results):
        raise RuntimeError('Benchmark produced request errors')


if __name__ == '__main__':
    asyncio.run(main())
