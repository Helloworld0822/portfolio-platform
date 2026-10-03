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
    'rust': ('http://127.0.0.1:18211', 'forge-throughput-rust'),
    'forge_before': ('http://127.0.0.1:18212', 'forge-throughput-before'),
    'forge_after': ('http://127.0.0.1:18214', 'forge-throughput-after'),
}
OUT = pathlib.Path(os.environ.get('THROUGHPUT_OUTPUT', str(ROOT / 'docs/forge-throughput-performance.json')))
PATHS = ['/api/health', '/api/posts', '/api/projects']
CLIENTS = [int(n) for n in os.environ.get('THROUGHPUT_CLIENTS', '1,16,64').split(',')]
REPEATS = int(os.environ.get('THROUGHPUT_REPEATS', '3'))
DURATION = float(os.environ.get('THROUGHPUT_SECONDS', '5'))
WARMUP = float(os.environ.get('THROUGHPUT_WARMUP', '1'))
if not CLIENTS or len(set(CLIENTS)) != len(CLIENTS) or any(n < 1 or n > 256 for n in CLIENTS):
    raise ValueError('Clients must be distinct integers in 1..256')
if not 1 <= REPEATS <= 10 or not 0.2 <= DURATION <= 60 or not 0 <= WARMUP <= 10:
    raise ValueError('Invalid repeat/duration/warmup bounds')



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
                label = base.docker('inspect', '-f', '{{index .Config.Labels "forge.throughput"}}', container)
                if label != '20261001-throughput':
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
        for clients in CLIENTS:
            for repeat in range(REPEATS):
                order = names[repeat:] + names[:repeat]
                for name in order:
                    await base.trial(name, path, clients, WARMUP) if WARMUP else None
                    trial = await base.trial(name, path, clients, DURATION)
                    trial['repeat'] = repeat + 1
                    results.append(trial)
                    print(json.dumps(trial), flush=True)
    report = {
        'date_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'host': platform.platform(),
        'limits': {'cpus_per_server': 2, 'memory_mib_per_server': 512,
                   'pool_connections': 5, 'forge_workers': 8, 'repeats': REPEATS, 'clients': CLIENTS,
                   'duration_seconds': DURATION, 'warmup_seconds': WARMUP,
                   'fixture_posts': 100, 'encoding': 'identity',
                   'order': 'three-way rotation per repeat',
                   'post_equivalence': 'All fields after timestamp normalization and sorting equal-time posts by ID; wire timestamp spelling/order can differ',
                   'runtime_bases': 'Rust Debian-based versus Forge Alpine/musl; application-level comparison'},
         'baseline_forge_commit': 'bc61821',
        'baseline_application_code_commit': '43871d3',
        'baseline_image': os.environ.get('THROUGHPUT_BASELINE_IMAGE', 'forge-throughput-baseline:bc61821-20261001'),
        'optimized_source_sha256': os.environ.get('THROUGHPUT_SOURCE_SHA256', 'not recorded'),
        'optimized_application_revision': os.environ.get('THROUGHPUT_AFTER_REVISION', 'working tree with source digest'),
        'optimized_forge_compiler_commit': os.environ.get('THROUGHPUT_COMPILER_REVISION', 'ba36611f92fdd444a4c29827d9020e8bcff05dde'),
        'optimized_forge_postgres_commit': os.environ.get('THROUGHPUT_POSTGRES_REVISION', 'working tree with source digest'),
        'optimized_dirty_diff_sha256': os.environ.get('THROUGHPUT_DIFF_SHA256', 'not recorded'),
        'optimized_forge_web_commit': os.environ.get('THROUGHPUT_WEB_REVISION', 'working tree with source digest'),
        'image_ids': {name: base.docker('inspect', '-f', '{{.Image}}', container) for name, (_, container) in base.SERVERS.items()},
        'equivalence': equivalent,
        'results': results,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + '\n')
    lines = ['# Forge server throughput: Rust / current baseline / optimized', '',
             f"Measured {report['date_utc']}. {REPEATS} repeats of {DURATION:g} seconds with {WARMUP:g}-second warmup, "
             '2 CPUs / 512 MiB per server, five DB connections, identical disposable fixtures. '
             'Three-way rotated order. Values are medians.', '',
             f"Baseline application: `bc61821` (code `43871d3`), image `{report['baseline_image']}`. "
             f"Optimized application: `{report['optimized_application_revision']}`, "
             f"source SHA-256 `{report['optimized_source_sha256']}`. Container image IDs are in JSON.", '',

             '| API | Clients | Rust req/s | Before req/s | After req/s | After/before | After/Rust | Before p95 ms | After p95 ms | Errors |',
             '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for path in PATHS:
        for clients in CLIENTS:
            grouped = {}
            for name in names:
                rows = [r for r in results if r['language'] == name and r['endpoint'] == path and r['concurrency'] == clients]
                grouped[name] = {key: statistics.median(r[key] for r in rows) for key in ['rps', 'p95_ms']}
            r, before, after = (grouped[n] for n in names)
            errors = sum(t['errors'] for t in results if t['endpoint'] == path and t['concurrency'] == clients)
            lines.append(f"| {path} | {clients} | {r['rps']:.2f} | {before['rps']:.2f} | {after['rps']:.2f} | {after['rps']/before['rps']:.2f}x | {after['rps']/r['rps']:.2f}x | {before['p95_ms']:.2f} | {after['p95_ms']:.2f} | {errors} |")
    lines += ['', 'Production applications remained running on this shared host. Small differences can be host variation. '
              'The Python aiohttp load generator can constrain high-throughput endpoints. '
              'Different worker/runtime/libc implementations prevent interpreting this as a universal language comparison. '
              'The Forge scheduler is not on this libmicrohttpd server path. CPU and memory samples are in the raw JSON.', '',
              'Both Forge variants retain immediate PostgreSQL ban checks. The new implementation combines '
              'the ban EXISTS gate and public endpoint data in one SQL command, reducing round trips without '
              'caching bans or response data. PostgreSQL prepared statements cache SQL plans only, bounded per connection. '
              'The web bridge reuses request metadata and enables epoll with a fallback when unavailable. '
              'The previous baseline already used PostgreSQL JSON aggregation. '
              'This combined benchmark does not isolate each optimization individually.', '',
              'All Forge payloads must match exactly; Rust post fields must match after timestamp normalization and '
              'sorting equal-time posts by ID. Rust/Forge health envelopes and project seed UUIDs can differ. '
              f"Compiler: `{report['optimized_forge_compiler_commit']}`; PostgreSQL: `{report['optimized_forge_postgres_commit']}`; Web: `{report['optimized_forge_web_commit']}`."]
    OUT.with_suffix('.md').write_text('\n'.join(lines) + '\n')
    if any(r['errors'] for r in results):
        raise RuntimeError('Benchmark produced request errors')


if __name__ == '__main__':
    asyncio.run(main())
