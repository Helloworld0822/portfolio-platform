import argparse
from concurrent.futures import ThreadPoolExecutor
import http.client
import json
import select
import socket
import subprocess
import time
import uuid


def docker(*args, timeout=30):
    return subprocess.check_output(['docker', *args], text=True,
                                   timeout=timeout).strip()


def wait(check, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, subprocess.SubprocessError, http.client.HTTPException):
            pass
        time.sleep(0.1)
    raise AssertionError('Disposable health lifecycle check timed out')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-image', required=True)
    options = parser.parse_args()
    suffix = uuid.uuid4().hex[:12]
    network = 'forge-health-lifecycle-' + suffix
    database = 'forge-health-db-' + suffix
    api = 'forge-health-api-' + suffix
    application = 'forge-health-check-' + suffix
    containers = []
    sockets = []
    lockers = []
    paused = False
    network_created = False
    stop = None

    def run(name, *args):
        docker('create', '--name', name, '--network', network,
               '--label', 'forge.health-lifecycle=test', *args)
        containers.append(name)
        docker('start', name)

    def sql(command):
        return docker('exec', database, 'psql', '-U', 'forge', '-d', 'forge_test',
                      '-v', 'ON_ERROR_STOP=1', '-qAtc', command)

    def ready():
        docker('exec', database, 'pg_isready', '-h', '127.0.0.1',
               '-U', 'forge', '-d', 'forge_test')
        return True

    def health(_=None):
        started = time.monotonic()
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=18)
        try:
            connection.request('GET', '/api/health', headers={'Connection': 'close'})
            response = connection.getresponse()
            return response.status, json.loads(response.read()), time.monotonic() - started
        finally:
            connection.close()

    def raw_health():
        client = socket.create_connection(('127.0.0.1', port), timeout=18)
        sockets.append(client)
        client.sendall(b'GET /api/health HTTP/1.1\r\nHost: localhost\r\n'
                       b'Connection: close\r\n\r\n')
        return client

    def lock_bans():
        process = subprocess.Popen(
            ['docker', 'exec', '-i', database, 'psql', '-U', 'forge', '-d',
             'forge_test', '-v', 'ON_ERROR_STOP=1', '-qAt'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True)
        lockers.append(process)
        process.stdin.write("BEGIN; LOCK TABLE banned_ips IN ACCESS EXCLUSIVE MODE; "
                            "SELECT 'gate';\n")
        process.stdin.flush()
        assert select.select([process.stdout], [], [], 5)[0], 'Lock handshake timed out'
        assert process.stdout.readline().strip() == 'gate', 'Lock handshake failed'
        return process

    def release_lock(process):
        if process.poll() is None:
            process.stdin.write('COMMIT;\n\\q\n')
            process.stdin.flush()
        _, error = process.communicate(timeout=10)
        assert process.returncode == 0, error
        lockers.remove(process)

    def query_waiting():
        return sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE "
                   "application_name='" + application + "' AND "
                   "wait_event_type='Lock' AND query LIKE '%banned_ips%')") == 't'

    def healthy_burst():
        with ThreadPoolExecutor(max_workers=16) as executor:
            results = list(executor.map(health, range(16)))
        assert all(status == 200 and body == {'status': 'ok'}
                   for status, body, _ in results), results

    docker('image', 'inspect', options.api_image)
    try:
        docker('network', 'create', '--label', 'forge.health-lifecycle=test', network)
        network_created = True
        run(database, '--network-alias', 'postgres', '--tmpfs', '/var/lib/postgresql/data',
            '-e', 'POSTGRES_USER=forge', '-e', 'POSTGRES_PASSWORD=disposable-test-only',
            '-e', 'POSTGRES_DB=forge_test', 'postgres:16-alpine')
        wait(ready)
        run(api, '--cpus', '2', '--memory', '512m', '--no-healthcheck',
            '-p', '127.0.0.1::8080', '-e',
            'DATABASE_URL=postgres://forge:disposable-test-only@postgres/forge_test'
            '?application_name=' + application,
            '-e', 'DATABASE_POOL_SIZE=1', '-e', 'JWT_SECRET=lifecycle-test-only-secret',
            '-e', 'ADMIN_GITHUB_USERNAME=Helloworld0822', '-e', 'GITHUB_CLIENT_ID=test',
            '-e', 'GITHUB_CLIENT_SECRET=test', '-e', 'FRONTEND_URL=http://frontend.test',
            '-e', 'BACKEND_BASE_URL=http://api.test', '-e', 'FORGE_WEB_THREADS=connection',
            options.api_image)
        port = int(json.loads(docker('inspect', api))[0]['NetworkSettings']
                   ['Ports']['8080/tcp'][0]['HostPort'])
        wait(lambda: health()[0] == 200)
        healthy_burst()

        locker = lock_bans()
        leader = raw_health()
        wait(query_waiting, timeout=3)
        # The observed lock wait proves the leader owns the batch before the
        # database is frozen; every subsequent callback must remain queued.
        docker('pause', database)
        paused = True
        try:
            leader.close()
            with ThreadPoolExecutor(max_workers=80) as executor:
                results = list(executor.map(health, range(80)))
            assert all(status == 503 and body == {'error': 'unavailable'}
                       for status, body, _ in results), results
            assert all(9 <= elapsed < 15 for _, _, elapsed in results), results
            print('Queued health: 80 requests returned 503 at the 10-second deadline', flush=True)
        finally:
            docker('unpause', database)
            paused = False
            release_lock(locker)
        wait(lambda: health()[0] == 200)
        healthy_burst()
        print('Disconnected active leader: DB resume and fresh health recovered', flush=True)

        terminated = sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                         "WHERE application_name='" + application + "'")
        assert terminated == 't', ('Expected one API DB session', terminated)
        first = health()
        assert first[0] in (200, 500, 503), first
        wait(lambda: health()[0] == 200)
        healthy_burst()
        print('Terminated DB session: singleton and concurrent health recovered', flush=True)

        locker = lock_bans()
        clients = [raw_health() for _ in range(16)]
        wait(query_waiting, timeout=3)
        clients[0].close()
        stop = subprocess.Popen(['docker', 'stop', '-t', '10', api],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True)
        try:
            time.sleep(0.2)
            release_lock(locker)
            _, error = stop.communicate(timeout=12)
            assert stop.returncode == 0, error
        finally:
            for client in clients:
                client.close()
        state = json.loads(docker('inspect', api))[0]['State']
        assert not state['Running'] and state['ExitCode'] == 0, state
        print('SIGTERM with active query, queued callbacks and disconnect: clean exit', flush=True)
    finally:
        if paused:
            subprocess.run(['docker', 'unpause', database], capture_output=True, timeout=30)
        for client in sockets:
            client.close()
        for process in lockers:
            try:
                if process.poll() is None:
                    process.stdin.write('ROLLBACK;\n\\q\n')
                    process.stdin.flush()
                process.communicate(timeout=10)
            except (OSError, subprocess.SubprocessError):
                process.kill()
                process.communicate(timeout=5)
        if stop is not None and stop.poll() is None:
            stop.kill()
            stop.communicate(timeout=5)
        for name in reversed(containers):
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=30)
        if network_created:
            subprocess.run(['docker', 'network', 'rm', network], capture_output=True, timeout=30)


if __name__ == '__main__':
    main()
