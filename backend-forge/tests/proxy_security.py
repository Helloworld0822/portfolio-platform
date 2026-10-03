import argparse
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

from integration import token


ROOT = Path(__file__).resolve().parents[2]


def docker(*args, input=None):
    return subprocess.check_output(['docker', *args], input=input, text=True).strip()


def create_network(name):
    for attempt in range(5):
        docker('network', 'create', '--label', 'forge.security=test', name)
        try:
            config = json.loads(docker('network', 'inspect', name))[0]['IPAM']['Config']
            subnet = next((ipaddress.ip_network(item['Subnet']) for item in config
                           if ipaddress.ip_network(item['Subnet']).version == 4), None)
            if subnet is None or subnet.num_addresses < 16:
                raise RuntimeError('Proxy test needs an IPv4 subnet with at least 16 addresses')
        finally:
            docker('network', 'rm', name)
        result = subprocess.run(['docker', 'network', 'create', '--label',
                                 'forge.security=test', '--subnet', str(subnet), name],
                                capture_output=True, text=True)
        if result.returncode == 0:
            return subnet
        if 'overlap' not in result.stderr.lower() or attempt == 4:
            raise subprocess.CalledProcessError(result.returncode, result.args,
                                                result.stdout, result.stderr)


def wait(check):
    for _ in range(60):
        try:
            if check():
                return
        except subprocess.CalledProcessError:
            pass
        time.sleep(1)
    raise RuntimeError('Disposable test service did not become ready')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-image', required=True)
    parser.add_argument('--browser', action='store_true')
    options = parser.parse_args()
    suffix = uuid.uuid4().hex[:12]
    network = 'forge-proxy-check-' + suffix
    containers = []
    database = 'forge-proxy-db-' + suffix
    api = 'forge-proxy-api-' + suffix
    client = 'forge-proxy-client-' + suffix
    secret = 'benchmark-only-test-secret'

    def run(name, *args):
        containers.append(name)
        return docker('run', '-d', '--name', name, '--network', network, *args)

    def sql(command):
        return docker('exec', database, 'psql', '-U', 'forge', '-d', 'forge_test',
                      '-v', 'ON_ERROR_STOP=1', '-Atc', command)

    def request(host, path, headers=(), admin=False):
        args = ['exec', client, 'curl', '-sS', '-o', '/dev/null', '-w', '%{http_code}']
        for name, value in headers:
            args.extend(['-H', name + ': ' + value])
        if admin:
            args.extend(['-H', 'Authorization: Bearer ' + token(secret=secret)])
        return int(docker(*args, 'http://' + host + path))

    docker('image', 'inspect', options.api_image)
    addresses = create_network(network)
    try:
        trusted = [str(addresses.network_address + n) for n in (10, 11)]
        run(database, '--network-alias', 'postgres', '--tmpfs', '/var/lib/postgresql/data',
            '-e', 'POSTGRES_USER=forge', '-e', 'POSTGRES_PASSWORD=disposable-test-only',
            '-e', 'POSTGRES_DB=forge_test', 'postgres:16-alpine')
        wait(lambda: docker('exec', database, 'pg_isready', '-U', 'forge', '-d', 'forge_test'))
        run(api, '--network-alias', 'api', '-e',
            'DATABASE_URL=postgres://forge:disposable-test-only@postgres/forge_test',
            '-e', 'JWT_SECRET=' + secret, '-e', 'ADMIN_GITHUB_USERNAME=Helloworld0822',
            '-e', 'FORGE_TRUSTED_PROXIES=' + ','.join(ip + '/32' for ip in trusted),
            '-e', 'FRONTEND_URL=http://frontend.test', '-e', 'GITHUB_CLIENT_ID=test',
            '-e', 'GITHUB_CLIENT_SECRET=test', options.api_image)
        wait(lambda: docker('exec', api, 'curl', '-fsS', 'http://127.0.0.1:8080/api/health'))
        docker('exec', '-i', api, 'sh', '-c', 'cat > /app/uploads/proxy-test.png', input='test image')
        sql("TRUNCATE comments,posts RESTART IDENTITY CASCADE; "
            "INSERT INTO posts(title,content_markdown,excerpt,published) "
            "VALUES('Post 1','Benchmark body.','Same fixture',true)")
        run(client, '--entrypoint', 'sleep', options.api_image, '3600')
        peer = json.loads(docker('inspect', client))[0]['NetworkSettings']['Networks'][network]['IPAddress']
        ipaddress.ip_address(peer)
        configs = [('react', ROOT / 'nginx/forge.conf', '/etc/nginx/nginx.conf'),
                   ('forge', ROOT / 'frontend-forge/nginx.conf', '/etc/nginx/conf.d/default.conf')]
        for index, (kind, source, target) in enumerate(configs):
            proxy = 'forge-proxy-' + kind + '-' + suffix
            run(proxy, '--ip', trusted[index], '-p', '127.0.0.1::80',
                '-v', str(source) + ':' + target + ':ro',
                '-v', str(ROOT / 'frontend-forge/dist') + ':/usr/share/nginx/html:ro',
                'nginx:1.27-alpine')
            wait(lambda: request(proxy, '/api/health') == 200)
            forged = [('CF-Connecting-IP', '8.8.8.8'), ('X-Real-IP', '8.8.8.8'),
                      ('X-Forwarded-For', '8.8.8.8')]
            sql("INSERT INTO banned_ips(ip) VALUES('8.8.8.8')")
            for path in ['/api/health', '/uploads/proxy-test.png']:
                assert request(proxy, path, forged) == 200, (kind, path, 'spoofed ban applied')
            sql("DELETE FROM banned_ips; INSERT INTO banned_ips(ip) VALUES('" + peer + "')")
            for path in ['/api/health', '/uploads/proxy-test.png']:
                assert request(proxy, path, forged) == 403, (kind, path, 'peer ban bypassed')
                assert request(proxy, path, forged, admin=True) == 200, (kind, path, 'admin bypass')
            sql('DELETE FROM banned_ips')
            print(kind + ' nginx: spoofed headers ignored, peer bans immediate, admin bypass valid', flush=True)
            if kind == 'forge' and options.browser:
                port = json.loads(docker('inspect', proxy))[0]['NetworkSettings']['Ports']['80/tcp'][0]['HostPort']
                subprocess.run(['npm', 'test'], cwd=ROOT / 'frontend-forge', check=True,
                               env={**os.environ, 'FORGE_FRONTEND_URL': 'http://127.0.0.1:' + port})
        print('Both nginx configurations: 12 security assertions passed', flush=True)
    finally:
        for name in reversed(containers):
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', network], capture_output=True)


if __name__ == '__main__':
    main()
