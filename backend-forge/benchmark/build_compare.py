import subprocess,time,json,pathlib,statistics
root=pathlib.Path(__file__).resolve().parents[2]
results=[]
for language in ['rust','forge']:
 for n in range(3):
  if language=='rust':image='forge-compare-rust-toolchain:local';script='cargo clean --release -p portfolio-blog-api >/dev/null 2>&1 && CARGO_BUILD_JOBS=2 cargo build --release --offline'
  else:
   image='forge-compare-forge-toolchain:local'
   script='backend-forge/build/toolchain/bin/forge backend-forge/src/main.fg --emit-c -o /tmp/benchmark-app.c -I backend-forge/vendor/forge-postgres -I backend-forge/vendor/forge-web && cat backend-forge/native/adapter.c >> /tmp/benchmark-app.c && cc -std=gnu11 -O2 -I backend-forge/toolchain/include -I backend-forge/vendor/forge-web/include /tmp/benchmark-app.c backend-forge/build/postgres/libforge_postgres.a backend-forge/build/web/libforge_web.a backend-forge/build/toolchain/lib/libforge_runtime.a backend-forge/build/toolchain/lib/libforge_std.a $(pkg-config --cflags --libs libpq libmicrohttpd json-c libcurl openssl) -lpthread -lm -o /tmp/benchmark-api'
  tick=time.perf_counter();p=subprocess.run(['docker','run','--rm','--cpus','2',image,'sh','-c',script],stdout=subprocess.PIPE,stderr=subprocess.PIPE);value={'language':language,'repeat':n+1,'wall_seconds':round(time.perf_counter()-tick,3),'exit_code':p.returncode};results.append(value);print(value,flush=True)
  if p.returncode:raise RuntimeError(p.stderr.decode())
report={'method':'Application-only release rebuild with dependencies/toolchain already built; container start and clean included; 2 CPU limit; Rust cargo clean --release removes application artifacts and thin LTO relinks; Forge C -O2 relinks generated app. Excludes dependency compilation/network. Different optimization/link policies limit causal interpretation.','results':results}
(root/'docs/forge-build-performance.json').write_text(json.dumps(report,indent=2)+'\n')
text=(root/'docs/forge-performance.md').read_text();text+='\n## Application rebuild\n\nWarm dependency builds, application sources rebuilt with 2 CPU limit. Median of three runs, including container start and clean.\n\n'
for language in ['rust','forge']:
 value=statistics.median(v['wall_seconds'] for v in results if v['language']==language);text+=f'- {language}: {value:.3f} seconds.\n'
text+='\nRust uses thin LTO; Forge emits C and compiles at -O2. Toolchain and dependency builds are excluded, so this does not compare clean ecosystem build times.\n'
(root/'docs/forge-performance.md').write_text(text)
