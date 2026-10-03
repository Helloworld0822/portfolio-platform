#!/usr/bin/env python3
"""Read-only load against disposable Rust/Forge test servers, never production."""
import asyncio,json,os,pathlib,platform,statistics,subprocess,time
import aiohttp
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(os.environ.get('BENCHMARK_OUTPUT',str(ROOT/'docs/forge-performance.json')))
SERVERS={'rust':(os.environ.get('RUST_BENCH_BASE','http://127.0.0.1:18111'),os.environ.get('RUST_BENCH_CONTAINER','forge-compare-rust')),'forge':(os.environ.get('FORGE_BENCH_BASE','http://127.0.0.1:18112'),os.environ.get('FORGE_BENCH_CONTAINER','forge-compare-forge'))}
def docker(*args):return subprocess.check_output(['docker',*args],text=True).strip()
def cgroup(container):
 pid=docker('inspect','-f','{{.State.Pid}}',container)
 rel=pathlib.Path('/proc/'+pid+'/cgroup').read_text().split('0::',1)[1].strip()
 return pathlib.Path('/sys/fs/cgroup')/rel.lstrip('/')
def usage(group):
 cpu=dict(line.split() for line in (group/'cpu.stat').read_text().splitlines())
 return int(cpu['usage_usec']),int((group/'memory.current').read_text())
def percentile(values,p):return sorted(values)[max(0,min(len(values)-1,int(len(values)*p)-1))]
async def trial(language,path,concurrency,seconds):
 url,container=SERVERS[language]; group=cgroup(container); latencies=[];errors=0;rss=[]
 before,_=usage(group);start=time.monotonic();deadline=start+seconds
 async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(limit=concurrency),timeout=aiohttp.ClientTimeout(total=10),auto_decompress=False) as session:
  async def worker():
   nonlocal errors
   while time.monotonic()<deadline:
    tick=time.monotonic()
    try:
     async with session.get(url+path,headers={'Accept-Encoding':'identity'}) as response:
      data=await response.read()
      if response.status!=200 or not data:errors+=1
    except Exception:errors+=1
    latencies.append((time.monotonic()-tick)*1000)
  async def memory():
   while time.monotonic()<deadline:rss.append(usage(group)[1]);await asyncio.sleep(.2)
  await asyncio.gather(*(worker() for _ in range(concurrency)),memory())
 elapsed=time.monotonic()-start;after,_=usage(group)
 return {'language':language,'endpoint':path,'concurrency':concurrency,'seconds':round(elapsed,3),'requests':len(latencies),'errors':errors,'rps':round(len(latencies)/elapsed,2),'p50_ms':round(percentile(latencies,.5),3),'p95_ms':round(percentile(latencies,.95),3),'p99_ms':round(percentile(latencies,.99),3),'cpu_core_percent':round((after-before)/1e6/elapsed*100,2),'memory_mib':round(max(rss,default=0)/1024**2,2)}
async def main():
 results=[];equivalence={}
 async with aiohttp.ClientSession() as session:
  for path in ['/api/health','/api/posts','/api/projects','/api/timeline']:
   payload=[]
   for lang,(base,_) in SERVERS.items():
    async with session.get(base+path) as r:assert r.status==200;(payload.append(await r.json()))
   # UUID/time fields in migration seeds are intentionally independent.
   equivalence[path]={'rust_items':len(payload[0]) if isinstance(payload[0],list) else None,'forge_items':len(payload[1]) if isinstance(payload[1],list) else None}
 for path in ['/api/health','/api/posts','/api/projects']:
  for concurrency in [1,16,64]:
   for repeat in range(3):
    order=['rust','forge'] if repeat%2==0 else ['forge','rust']
    for lang in order:
     await trial(lang,path,concurrency,1)
     value=await trial(lang,path,concurrency,5);value['repeat']=repeat+1;results.append(value);print(json.dumps(value),flush=True)
 report={'date_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'host':platform.platform(),'cpu_model':next((l.split(':',1)[1].strip() for l in pathlib.Path('/proc/cpuinfo').read_text().splitlines() if l.startswith('model name')),'unknown'),'limits':{'cpu_cores_per_server':2,'memory_mib_per_server':512,'database_pool_per_server':5,'forge_http_workers':8,'rust_http_workers':'Actix automatic default','duration_per_trial_seconds':5,'repeats':3,'transport':'HTTP/1.1 keep-alive, identity encoding','load_generator':'Python aiohttp; client ceiling may constrain results','database':'one disposable PostgreSQL16 instance, separate databases, identical fixtures','build_note':'Containers may have different libc/runtime bases; comparison is application-level, not isolated language performance'},'equivalence':equivalence,'results':results}
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(report,indent=2)+'\n')
 table=[]
 for path in ['/api/health','/api/posts','/api/projects']:
  for c in [1,16,64]:
   row=[]
   for lang in ['rust','forge']:
    group=[r for r in results if r['endpoint']==path and r['concurrency']==c and r['language']==lang]
    row.append({key:round(statistics.median(v[key] for v in group),2) for key in ['rps','p95_ms','cpu_core_percent','memory_mib','errors']})
   table.append((path,c,row[0],row[1]))
 lines=['# Rust / Forge portfolio API performance','',f"Measured: {report['date_utc']}; {report['cpu_model']}.",'','2 CPU cores / 512 MiB per app; PostgreSQL pool 5; 3 repeats of 5 seconds after warmup. Identical seeded database fixtures; HTTP keep-alive without compression. Values are medians of runs.','','| Endpoint | Clients | Rust req/s | Forge req/s | Forge/Rust | Rust p95 ms | Forge p95 ms | Rust MiB | Forge MiB | Errors (R/F) |','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
 for path,c,r,f in table:lines.append(f"| {path} | {c} | {r['rps']} | {f['rps']} | {f['rps']/r['rps']:.2f}x | {r['p95_ms']} | {f['p95_ms']} | {r['memory_mib']} | {f['memory_mib']} | {r['errors']}/{f['errors']} |")
 lines+=['','CPU values and every raw run are in forge-performance.json. Container memory includes native libraries and caches; it is not allocated heap alone.','', 'This measures these implementations on one shared host, not Rust versus Forge in general. The Python load generator, Actix automatic worker count, synchronous Forge libpq calls and different libc bases limit causal interpretation. Production stacks remain running; repeat on an otherwise idle dedicated host for release decisions.','','The Forge implementation checks IP bans in PostgreSQL on every public request; Rust caches bans in memory. Database-heavy endpoints may therefore favor Rust independently of compiler quality. Do not remove safety checks merely to improve benchmark numbers.']
 OUT.with_suffix('.md').write_text('\n'.join(lines)+'\n')
if __name__=='__main__':asyncio.run(main())
