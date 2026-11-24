import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_HELPER = ROOT / 'scripts/cloud-run-api-runtime.sh'
DEPLOY = ROOT / 'scripts/deploy-cloud-run.sh'

FAKE = r"""
import json
import os
from pathlib import Path
import sys

tool = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['COMMANDS'], 'a') as stream:
    print(json.dumps([tool, *args]), file=stream)

registry = 'asia-northeast3-docker.pkg.dev/portfolio-514800/portfolio-platform'
sha = '0' * 40
rust = registry + '/api@sha256:' + '1' * 64
forge = registry + '/forge-api@sha256:' + '2' * 64
nginx = registry + '/nginx@sha256:' + '3' * 64
backup = registry + '/backup@sha256:' + '4' * 64
old = forge if os.environ['SERVING'] == 'forge' else rust
new = {'forge': forge, 'rust': rust}.get(os.environ['CHOICE'], old)

api_env = [{'name': 'DATABASE_URL', 'valueFrom': {'secretKeyRef': {'name': 'portfolio-neon-database-url'}}}]
forge_env = [{'name': 'HOST', 'value': '0.0.0.0'}, {'name': 'PORT', 'value': '8081'},
             {'name': 'FORGE_TRUSTED_PROXIES', 'value': '127.0.0.1/32'}]

def containers(image, proxy=True):
    api = {'name': 'api', 'image': image, 'env': api_env[:],
           'volumeMounts': [{'mountPath': '/app/uploads'}]}
    if image == forge and proxy:
        api['env'] += forge_env
        api['resources'] = {'limits': {'memory': '512Mi'}}
    return [api, {'name': 'nginx', 'image': nginx}]

if tool == 'git':
    print(sha + ('\trefs/heads/main' if args[0] == 'ls-remote' else ''))
elif tool == 'gh':
    workflow = args[args.index('--workflow') + 1]
    print(json.dumps([{'headSha': sha}]) if os.environ.get('CI_PENDING') != workflow else '[]')
elif tool == 'docker':
    print('{}')
elif tool == 'curl':
    sys.exit(int(os.environ.get('PUBLIC_SMOKE_FAIL', '0')))
elif tool == 'gcloud':
    if args[:3] == ['run', 'services', 'describe']:
        traffic_revision = 'old'
        recorded = Path(os.environ['COMMANDS']).read_text().splitlines()
        if any('candidate=100' in json.loads(line) for line in recorded):
            traffic_revision = 'candidate'
        if os.environ.get('STALE_TRAFFIC') == '1':
            traffic_revision = 'old'
        traffic = [{'percent': 100, 'revisionName': traffic_revision},
                   {'tag': 'ci-42-1', 'revisionName': 'candidate'}]
        print(json.dumps({'status': {'traffic': traffic, 'latestCreatedRevisionName': 'old',
                                    'latestReadyRevisionName': 'old'},
                          'spec': {'template': {'spec': {'containers': containers(old)}}}}))
    elif args[:3] == ['run', 'revisions', 'describe']:
        image = old if args[3] == 'old' else new
        conditions = [{'type': name, 'status': 'True'} for name in ['Ready', 'ContainerHealthy']]
        actual = containers(image, os.environ.get('BAD_PROXY') != '1')
        if args[3] == 'old' and os.environ.get('OLD_MEMORY'):
            actual[0]['resources']['limits']['memory'] = os.environ['OLD_MEMORY']
        print(json.dumps({'spec': {'containers': actual},
                          'status': {'conditions': conditions}}))
    elif args[:3] == ['artifacts', 'docker', 'images']:
        kind = args[4].rsplit('/', 1)[-1].split(':', 1)[0]
        if kind == 'forge-api' and os.environ.get('WRONG_DIGEST') == '1':
            print('sha256:' + '5' * 64)
            sys.exit(0)
        print({'api': rust, 'forge-api': forge, 'nginx': nginx, 'backup': backup}[kind].split('@')[1])
    elif args[:3] == ['run', 'jobs', 'describe']:
        print(json.dumps({'spec': {'template': {'spec': {'template': {'spec': {'containers': [
             {'name': 'backup', 'env': api_env, 'image': backup}]}}}}}}))
"""


class DeployRuntimeTests(unittest.TestCase):
    def run_fixture(self, *, serving='rust', choice='keep', verified=False, **extra):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            log = path / 'commands.jsonl'
            for tool in ('git', 'gh', 'docker', 'gcloud', 'curl', 'sleep'):
                executable = path / tool
                executable.write_text('#!/usr/bin/env python3\n' + FAKE)
                executable.chmod(0o755)
            env = dict(os.environ, PATH=f'{tmp}:{os.environ["PATH"]}', COMMANDS=str(log),
                       GITHUB_RUN_ID='42', GITHUB_RUN_ATTEMPT='1', GITHUB_REPOSITORY='example/repo',
                       PORTFOLIO_API_RUNTIME=choice,
                       FORGE_STAGING_COMMIT='0' * 40 if verified else '',
                       FORGE_STAGING_DIGEST='sha256:' + '2' * 64 if verified else '',
                       SERVING=serving, CHOICE=choice, **extra)
            result = subprocess.run(['bash', DEPLOY], cwd=ROOT, env=env, capture_output=True, text=True)
            commands = [json.loads(line) for line in log.read_text().splitlines()]
            return result, commands

    def test_automatic_rust_preserves_serving_runtime_and_traffic(self):
        result, calls = self.run_fixture()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('API: rust', result.stdout)
        self.assertFalse(any('forge-api:src-' in item for call in calls for item in call))
        self.assertFalse(any('update-traffic' in call or call[0] == 'gh' for call in calls))

    def test_automatic_keeps_forge_and_requires_current_forge_ci(self):
        result, calls = self.run_fixture(serving='forge')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('API: forge', result.stdout)
        workflows = {call[call.index('--workflow') + 1] for call in calls if call[0] == 'gh'}
        self.assertEqual(workflows, {'ci.yml', 'forge.yml'})
        self.assertFalse(any('update-traffic' in call for call in calls))

    def test_explicit_forge_is_blocked_without_staging_or_ci(self):
        for kwargs in ({}, {'verified': True, 'CI_PENDING': 'ci.yml'},
                       {'verified': True, 'CI_PENDING': 'forge.yml'}):
            with self.subTest(kwargs=kwargs):
                result, calls = self.run_fixture(choice='forge', **kwargs)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any('update-traffic' in call or 'update' in call for call in calls))

    def test_automatic_rightsizes_existing_forge_revision(self):
        result, calls = self.run_fixture(serving='forge', OLD_MEMORY='1Gi')
        self.assertEqual(result.returncode, 0, result.stderr)
        update = next(call for call in calls if '--no-traffic' in call)
        self.assertIn('--memory=512Mi', update[update.index('api'):])
        self.assertTrue(any('candidate=100' in call for call in calls))

    def test_ready_forge_candidate_uses_loopback_and_retains_rollback(self):
        result, calls = self.run_fixture(choice='forge', verified=True, PUBLIC_SMOKE_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        update = next(call for call in calls if call[:4] == ['gcloud', 'run', 'services', 'update'])
        self.assertIn('--no-traffic', update)
        self.assertIn('--update-env-vars=HOST=0.0.0.0,PORT=8081,FORGE_TRUSTED_PROXIES=127.0.0.1/32', update)
        traffic = [call[-1] for call in calls if '--to-revisions' in call]
        self.assertEqual(traffic, ['candidate=100', 'old=100'])

    def test_promotion_confirms_candidate_actually_receives_traffic(self):
        result, calls = self.run_fixture(choice='forge', verified=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Serving candidate (runtime=forge', result.stdout)
        traffic = [call[-1] for call in calls if '--to-revisions' in call]
        self.assertEqual(traffic, ['candidate=100'])

        result, calls = self.run_fixture(choice='forge', verified=True, STALE_TRAFFIC='1')
        self.assertNotEqual(result.returncode, 0)
        traffic = [call[-1] for call in calls if '--to-revisions' in call]
        self.assertEqual(traffic, ['candidate=100', 'old=100'])

    def test_explicit_rust_rollback_removes_forge_only_proxy_option(self):
        result, calls = self.run_fixture(serving='forge', choice='rust')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Serving candidate (runtime=rust', result.stdout)
        update = next(call for call in calls if call[:4] == ['gcloud', 'run', 'services', 'update'])
        self.assertIn('--remove-env-vars=FORGE_TRUSTED_PROXIES', update)
        self.assertIn('--memory=1Gi', update)
        self.assertFalse(any(call[0] == 'gh' for call in calls))

    def test_wrong_candidate_proxy_is_never_promoted(self):
        result, calls = self.run_fixture(choice='forge', verified=True, BAD_PROXY='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any('--to-revisions' in call for call in calls))

    def test_attested_digest_must_match_built_image(self):
        result, calls = self.run_fixture(choice='forge', verified=True, WRONG_DIGEST='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('digest does not match', result.stderr)
        self.assertFalse(any('update-traffic' in call or 'update' in call for call in calls))

    def test_automatic_does_not_promote_an_unverified_forge_digest(self):
        result, calls = self.run_fixture(serving='forge', WRONG_DIGEST='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('manual promotion', result.stdout)
        self.assertFalse(any('update-traffic' in call or 'update' in call for call in calls))

    def test_stage_image_resolves_forge_without_mutating_cloud_run(self):
        result, calls = self.run_fixture(choice='stage-forge')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Stage in an isolated service', result.stdout)
        self.assertIn('forge-api@sha256:', result.stdout)
        self.assertFalse(any('update-traffic' in call or 'update' in call for call in calls))

    def test_unknown_image_is_not_replaced(self):
        result = subprocess.run(
            ['bash', '-c', 'source "$1"; select_api_runtime forge "$2" "$3"',
             '_', RUNTIME_HELPER, 'unrecognized:latest', 'known'],
            capture_output=True,
        )
        self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
