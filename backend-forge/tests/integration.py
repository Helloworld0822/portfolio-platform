import base64
import concurrent.futures
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import subprocess
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get('API_BASE', 'http://127.0.0.1:8080')
SECRET = os.environ.get('TEST_JWT_SECRET', 'forge-integration-test-secret')


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=').decode()


def token(login='Helloworld0822', role='admin', expiry=None, secret=SECRET, alg='HS256'):
    head = encode({'alg': alg, 'typ': 'JWT'})
    body = encode({'sub': login, 'role': role, 'avatar_url': 'https://avatar.test/a.png',
                  'exp': expiry if expiry is not None else int(time.time()) + 3600})
    data = f'{head}.{body}'
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), data.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
    return f'{data}.{signature}'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def request(method, path, data=None, auth=None, headers=None, raw=None):
    headers = dict(headers or {})
    if auth:
        headers['Authorization'] = f'Bearer {auth}'
    if raw is not None:
        body = raw
    elif data is not None:
        body = json.dumps(data, ensure_ascii=False).encode()
        headers['Content-Type'] = 'application/json'
    else:
        body = None
    req = urllib.request.Request(BASE + path, data=body, method=method, headers=headers)
    try:
        response = OPENER.open(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        text = response.read()
        try:
            result = json.loads(text)
        except (ValueError, UnicodeDecodeError):
            result = text
        return response.status, result, dict(response.headers)


class MockGitHub(BaseHTTPRequestHandler):
    pause = None
    seen = []
    seen_lock = threading.Lock()
    def log_message(self, *args):
        pass

    def send(self, body, status=200):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        form = urllib.parse.parse_qs(self.rfile.read(int(self.headers.get('Content-Length', 0))).decode())
        code = form.get('code', [''])[0]
        if code in ('admin', 'user', 'blocked'):
            self.send({'access_token': 'mock-' + code})
        else:
            self.send({'error': 'bad_code'})

    def do_GET(self):
        with MockGitHub.seen_lock:
            MockGitHub.seen.append(self.path)
        path = urllib.parse.urlsplit(self.path).path
        if path == '/user':
            bearer = self.headers.get('Authorization', '')
            login = {'Bearer mock-admin': 'Helloworld0822', 'Bearer mock-user': 'reader',
                     'Bearer mock-blocked': 'blocked-reader'}.get(bearer)
            self.send({'login': login, 'avatar_url': 'https://avatar.test/a.png'} if login else {}, 200 if login else 401)
        elif path in ('/users/Helloworld0822/repos', '/user/repos', '/orgs/test/repos', '/users/test/repos'):
            pause = MockGitHub.pause
            if pause is not None:
                with pause['lock']:
                    pause['count'] += 1
                    if pause['count'] >= 1:
                        pause['ready'].set()
                pause['release'].wait(timeout=10)
            self.send([{'name': 'public', 'full_name': 'test/public', 'html_url': 'https://github.com/test/public',
                        'description': 'demo', 'language': 'Forge', 'private': False, 'owner': {'login': 'test'}},
                       {'name': 'hidden', 'full_name': 'test/hidden', 'html_url': 'https://github.com/test/hidden',
                        'description': None, 'language': None, 'private': True, 'owner': {'login': 'test'}}])
        elif path == '/repos/test/malformed':
            self.send({'private': False})
        elif path == '/repos/test/malformed/languages':
            self.send({'Forge': 'not an integer'})
        elif path == '/repos/test/public/languages':
            self.send({'Forge': 1200, 'C': 300})
        elif path == '/repos/test/hidden/languages':
            self.send({'Rust': 999})
        elif path == '/repos/test/public':
            self.send({'private': False})
        elif path == '/repos/test/hidden':
            self.send({'private': True})
        else:
            self.send({'message': 'Not Found'}, 404)


class PortfolioTests(unittest.TestCase):
    def call(self, method, path, data=None, expected=200, auth=None, **kwargs):
        status, body, headers = request(method, path, data, auth, **kwargs)
        self.assertEqual(status, expected, (method, path, body))
        return body, headers

    def oauth(self, code, path='/'):
        _, headers = self.call('GET', '/api/auth/github/login?state=' + urllib.parse.quote(path), expected=302)
        state = urllib.parse.parse_qs(urllib.parse.urlsplit(headers['Location']).query)['state'][0]
        cookie = headers['Set-Cookie'].split(';', 1)[0]
        return self.call('GET', '/api/auth/github/callback?code=' + code + '&state=' + urllib.parse.quote(state),
                         expected=302, headers={'Cookie': cookie})

    def post(self, published=True):
        body, _ = self.call('POST', '/api/admin/posts', {'title': "Forge '); DROP TABLE posts; --", 'excerpt': '요약',
                            'content_markdown': '# 포트폴리오\nForge migration', 'published': published}, 201, token())
        self.addCleanup(self.call, 'DELETE', '/api/admin/posts/' + str(body['id']), expected=204, auth=token())
        return body

    def project(self, **extra):
        data = {'title': 'Forge project', 'description': '설명', 'details': ['하나', '둘'],
                'tags': ['Forge'], 'status': 'active', 'published': True}
        data.update(extra)
        body, _ = self.call('POST', '/api/admin/projects', data, 201, token())
        self.addCleanup(self.call, 'DELETE', '/api/admin/projects/' + body['id'], expected=204, auth=token())
        return body

    def test_health_cors_and_not_found(self):
        body, headers = self.call('GET', '/api/health', headers={'Origin': 'http://frontend.test'})
        self.assertEqual(body, {'status': 'ok'})
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'http://frontend.test')
        _, headers = self.call('GET', '/api/health', headers={'Origin': 'https://attacker.test'})
        self.assertNotIn('Access-Control-Allow-Origin', headers)
        self.call('OPTIONS', '/api/admin/posts', expected=204, headers={'Origin': 'http://frontend.test'})
        self.call('GET', '/api/missing', expected=404)

    def test_admin_jwt_validation(self):
        for invalid in (None, 'broken', token(role='user'), token(expiry=1), token(secret='wrong'), token(alg='none'), token(role='oauth')):
            with self.subTest(token=invalid):
                self.call('GET', '/api/admin/posts', expected=401, auth=invalid)
        self.call('GET', '/api/admin/posts', auth=token())

    @unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'disposable DB required')
    def test_health_authorization_and_error_cors(self):
        def sql(command):
            subprocess.run(['psql', os.environ['TEST_DATABASE_URL'], '-v', 'ON_ERROR_STOP=1', '-c', command],
                           check=True, capture_output=True)
        headers = {'X-Real-IP': '8.8.4.7', 'Origin': 'http://frontend.test'}
        sql("INSERT INTO banned_ips(ip) VALUES('8.8.4.7')")
        renamed = False
        try:
            for auth in (None, 'broken', token(role='user'), token(expiry=1), token(secret='wrong'), token(alg='none')):
                with self.subTest(auth=auth):
                    _, response_headers = self.call('GET', '/api/health', expected=403, auth=auth, headers=headers)
                    self.assertEqual(response_headers['Access-Control-Allow-Origin'], 'http://frontend.test')
            body, _ = self.call('GET', '/api/health', auth=token(), headers=headers)
            self.assertEqual(body, {'status': 'ok'})
            sql('ALTER TABLE banned_ips RENAME TO unavailable_banned_ips')
            renamed = True
            _, response_headers = self.call('GET', '/api/health', expected=500, headers=headers)
            self.assertEqual(response_headers['Access-Control-Allow-Origin'], 'http://frontend.test')
            self.call('GET', '/api/health', auth=token(), headers=headers)
        finally:
            if renamed:
                sql('ALTER TABLE unavailable_banned_ips RENAME TO banned_ips')
            sql("DELETE FROM banned_ips WHERE ip='8.8.4.7'")
        body, _ = self.call('GET', '/api/health', headers=headers)
        self.assertEqual(body, {'status': 'ok'})

    @unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'disposable DB required')
    def test_health_concurrent_ip_results(self):
        def sql(command):
            subprocess.run(['psql', os.environ['TEST_DATABASE_URL'], '-v', 'ON_ERROR_STOP=1', '-c', command],
                           check=True, capture_output=True)
        sql("INSERT INTO banned_ips(ip) VALUES('8.8.4.8'),('8.8.4.9')")
        sql("UPDATE banned_ips SET expires_at=now()-interval '1 second' WHERE ip='8.8.4.9'")
        cases = [('8.8.4.8', None, 403), ('8.8.4.8', token(), 200),
                 ('8.8.4.8', token(secret='wrong'), 403), ('8.8.4.9', None, 200),
                 ('8.8.4.10', None, 200), ('8.8.4.10', token(role='user'), 200)] * 16
        def check(case):
            ip, auth, expected = case
            self.call('GET', '/api/health', expected=expected, auth=auth, headers={'X-Real-IP': ip})
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
                list(executor.map(check, cases))
            sql("UPDATE banned_ips SET expires_at=now()-interval '1 second' WHERE ip='8.8.4.8'")
            with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
                list(executor.map(check, [(ip, auth, 200) for ip, auth, _ in cases]))
        finally:
            sql("DELETE FROM banned_ips WHERE ip IN ('8.8.4.8','8.8.4.9')")

    def test_post_crud_and_draft_visibility(self):
        post = self.post(False)
        path = '/api/posts/' + str(post['id'])
        self.call('GET', path, expected=404)
        admin, _ = self.call('GET', path.replace('/api/', '/api/admin/'), auth=token())
        self.assertFalse(admin['published'])
        self.call('PUT', path.replace('/api/', '/api/admin/'), {'published': True}, auth=token())
        public, _ = self.call('GET', path)
        self.assertEqual(public['title'], post['title'])
        listing, _ = self.call('GET', '/api/posts')
        summary = next(row for row in listing if row['id'] == post['id'])
        self.assertEqual(summary['comment_count'], 0)
        self.assertNotIn('content_markdown', summary)
        self.call('PUT', path.replace('/api/', '/api/admin/'), {'title': ' '}, 400, token())
        self.call('GET', '/api/posts/9223372036854775808', expected=404)

    @unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'disposable DB required')
    def test_post_list_empty_drafts_and_banned_empty(self):
        for auth in (None, token()):
            listing, _ = self.call('GET', '/api/posts', auth=auth)
            self.assertEqual(listing, [])
        listing, _ = self.call('GET', '/api/admin/posts', auth=token())
        self.assertEqual(listing, [])
        draft = self.post(False)
        listing, _ = self.call('GET', '/api/posts')
        self.assertEqual(listing, [])
        listing, _ = self.call('GET', '/api/admin/posts', auth=token())
        self.assertEqual([row['id'] for row in listing], [draft['id']])
        ip = '8.8.8.17'
        self.call('POST', '/api/admin/bans/ips', {'ip': ip}, 201, token())
        self.addCleanup(self.call, 'DELETE', '/api/admin/bans/ips/' + ip, expected=204, auth=token())
        _, headers = self.call('GET', '/api/posts', expected=403,
                               headers={'X-Real-IP': ip, 'Origin': 'http://frontend.test'})
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'http://frontend.test')
        listing, _ = self.call('GET', '/api/posts', auth=token(), headers={'X-Real-IP': ip})
        self.assertEqual(listing, [])

    @unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'disposable DB required')
    def test_post_list_json_types_escaping_timestamps_and_order(self):
        database = os.environ['TEST_DATABASE_URL']
        def sql(command):
            subprocess.run(['psql', database, '-v', 'ON_ERROR_STOP=1', '-c', command],
                           check=True, capture_output=True)
        ids = (9223372036854775707, 9223372036854775708, 9223372036854775709)
        fixture = {'title': '한글 😀 "quote" \n tab\t slash\\ single\'quote',
                   'excerpt': '요약 \r\n "escaped" \\', 'content_markdown': 'body'}
        fixture['title'] += ''.join(chr(value) for value in range(1, 32)) + '\u2028\u2029'
        payload = json.dumps(fixture, ensure_ascii=False).replace("'", "''")
        self.addCleanup(sql, 'DELETE FROM posts WHERE id IN (' + ','.join(map(str, ids)) + ')')
        sql("INSERT INTO posts(id,title,excerpt,content_markdown,published,created_at) "
            "SELECT item.id,data->>'title',data->>'excerpt',data->>'content_markdown',item.published,item.created_at "
            "FROM (VALUES "
            f"({ids[0]},true,'2026-01-02 03:04:05.123456+05:30'::timestamptz),"
            f"({ids[1]},true,'2026-01-03 03:04:05-04:00'::timestamptz),"
            f"({ids[2]},false,'2026-01-04 03:04:05+00'::timestamptz)) item(id,published,created_at), "
            f"(SELECT '{payload}'::jsonb AS data) fixture")
        sql(f"INSERT INTO comments(post_id,author_login,body) SELECT {ids[0]},'list-json-fixture','comment' "
            "FROM generate_series(1,2)")
        expected = {}
        for index, post_id in enumerate(ids):
            full, _ = self.call('GET', '/api/admin/posts/' + str(post_id), auth=token())
            expected[post_id] = {key: full[key] for key in ('id', 'title', 'excerpt', 'created_at')}
            expected[post_id]['comment_count'] = 2 if index == 0 else 0
        for path, auth, ordered_ids in (('/api/posts', None, ids[1::-1]),
                                        ('/api/posts', token(), ids[1::-1]),
                                        ('/api/admin/posts', token(), ids[::-1])):
            listing, _ = self.call('GET', path, auth=auth)
            selected = [row for row in listing if row['id'] in ids]
            self.assertEqual([row['id'] for row in selected], list(ordered_ids))
            for row in selected:
                self.assertEqual(row, expected[row['id']])
                self.assertIs(type(row['id']), int)
                self.assertIs(type(row['comment_count']), int)
                self.assertEqual(row['title'], fixture['title'])
                self.assertEqual(row['excerpt'], fixture['excerpt'])

    def test_json_and_typed_validation(self):
        invalid = [{}, {'title': 'x', 'excerpt': 'x', 'content_markdown': 'x', 'published': 'true'},
                   {'title': 99, 'excerpt': 'x', 'content_markdown': 'x', 'published': True}, []]
        for data in invalid:
            self.call('POST', '/api/admin/posts', data, 400, token())
        self.call('POST', '/api/admin/posts', expected=400, auth=token(), raw=b'{bad', headers={'Content-Type': 'application/json'})
        self.call('POST', '/api/admin/posts', expected=400, auth=token(), raw=b'{}\x00garbage', headers={'Content-Type': 'application/json'})
        self.call('POST', '/api/admin/posts', expected=413, auth=token(), raw=b'x' * (2 * 1024 * 1024 + 1))

    def test_project_crud_metadata_and_url_validation(self):
        project = self.project(url='https://github.com/test/public', attachments=[{'name': 'image', 'url': '/uploads/a.png', 'kind': 'image'}])
        self.assertEqual(project['repo_languages'], {'Forge': 1200, 'C': 300})
        self.assertFalse(project['repo_private'])
        path = '/api/admin/projects/' + project['id']
        updated, _ = self.call('PUT', path, {'title': 'new', 'url': None}, auth=token())
        self.assertEqual(updated['details'], ['하나', '둘'])
        self.assertEqual(updated['url'], project['url'])
        self.assertEqual(updated['repo_languages'], project['repo_languages'])
        self.call('PUT', path, {'url': 'javascript:alert(1)'}, 400, token())
        self.call('PUT', path, {'details': [2]}, 400, token())
        self.call('PUT', path, {'attachments': [{'name': 'x', 'kind': 'x', 'url': 'javascript:x'}]}, 400, token())
        self.call('GET', '/api/projects')
        self.call('GET', '/api/admin/projects', auth=token())

    def test_project_account_and_private_metadata(self):
        account = self.project(url='https://github.com/test')
        self.assertEqual(account['repo_languages'], {'Forge': 1200, 'C': 300})
        self.assertFalse(account['repo_private'])
        private = self.project(url='https://github.com/test/hidden.git')
        self.assertTrue(private['repo_private'])

    def test_github_error_metadata_and_outbound_path_validation(self):
        for repo in ['missing', 'malformed']:
            with self.subTest(repo=repo):
                row = self.project(url='https://github.com/test/' + repo)
                self.assertEqual(row['repo_languages'], {})
                self.assertFalse(row['repo_private'])
        for url in ['https://github.com.evil.test/test/public', 'https://github.com/test/public/extra',
                    'https://github.com/test/public?redirect=evil', 'https://github.com/test/public#fragment',
                    'https://github.com/test/%2e%2e', 'https://github.com/test/public%2flanguages']:
            with self.subTest(url=url):
                with MockGitHub.seen_lock:
                    before = len(MockGitHub.seen)
                row = self.project(url=url)
                self.assertEqual(row['repo_languages'], {})
                with MockGitHub.seen_lock:
                    self.assertEqual(len(MockGitHub.seen), before)

    def test_timeline_crud_and_reorder(self):
        created = []
        for title in ('first', 'second'):
            row, _ = self.call('POST', '/api/admin/timeline', {'period': '2026', 'title': title, 'org': 'Forge', 'description': 'test'}, 201, token())
            created.append(row)
            self.addCleanup(self.call, 'DELETE', '/api/admin/timeline/' + row['id'], expected=204, auth=token())
        updated, _ = self.call('PUT', '/api/admin/timeline/' + created[0]['id'], {'description': 'changed'}, auth=token())
        self.assertEqual(updated['title'], 'first')
        all_rows, _ = self.call('GET', '/api/timeline')
        ids = [created[1]['id'], created[0]['id']] + [row['id'] for row in all_rows if row['id'] not in {c['id'] for c in created}]
        self.call('POST', '/api/admin/timeline/reorder', {'ids': ids}, 204, token())
        ordered, _ = self.call('GET', '/api/admin/timeline', auth=token())
        self.assertEqual([row['id'] for row in ordered], ids)
        self.call('POST', '/api/admin/timeline/reorder', {'ids': ['not-uuid']}, 400, token())
        after, _ = self.call('GET', '/api/timeline')
        self.assertEqual([row['id'] for row in after], ids)

    def test_comment_auth_ownership_counts_and_moderation(self):
        post = self.post()
        path = f"/api/posts/{post['id']}/comments"
        self.call('POST', path, {'body': 'x'}, 401)
        self.call('POST', path, {'body': ' '}, 400, token('reader', 'user'))
        self.call('POST', path, {'body': '한' * 2001}, 400, token('reader', 'user'))
        comment, _ = self.call('POST', path, {'body': '  한글 댓글  '}, 201, token('reader', 'user'))
        self.assertEqual(comment['body'], '한글 댓글')
        comments, _ = self.call('GET', path)
        self.assertEqual(comments[0]['id'], comment['id'])
        listing, _ = self.call('GET', '/api/posts')
        self.assertEqual(next(row['comment_count'] for row in listing if row['id'] == post['id']), 1)
        self.call('DELETE', '/api/comments/' + comment['id'], expected=403, auth=token('another', 'user'))
        self.call('DELETE', '/api/comments/' + comment['id'], expected=204, auth=token('READER', 'user'))
        comment, _ = self.call('POST', path, {'body': 'moderate'}, 201, token('reader', 'user'))
        self.call('DELETE', '/api/admin/comments/' + comment['id'], expected=204, auth=token())

    def test_contact_duplicate_rate_and_admin(self):
        data = {'name': '  reader ', 'email': 'ContactCase@example.test', 'message': '  hello  '}
        row, _ = self.call('POST', '/api/contact', data, 201, headers={'X-Real-IP': '8.8.4.4'})
        self.assertEqual(row['name'], 'reader')
        self.call('POST', '/api/contact', dict(data, email='contactcase@example.test'), 400, headers={'X-Real-IP': '8.8.4.4'})
        self.call('GET', '/api/admin/contact', auth=token())
        result, _ = self.call('POST', '/api/admin/contact/dedupe', auth=token())
        self.assertIn('removed', result)
        self.call('DELETE', '/api/admin/contact/' + row['id'], expected=204, auth=token())
        for n in range(3):
            row, _ = self.call('POST', '/api/contact', dict(data, message=str(n)), 201, headers={'X-Real-IP': '8.8.4.4'})
            self.call('DELETE', '/api/admin/contact/' + row['id'], expected=204, auth=token())
        self.call('POST', '/api/contact', dict(data, message='limit'), 429, headers={'X-Real-IP': '8.8.4.4'})
        self.call('POST', '/api/contact', dict(data, email='bad'), 400)

    def test_contact_concurrent_duplicate(self):
        data = {'name': 'reader', 'email': 'concurrent@example.test', 'message': 'same'}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: request('POST', '/api/contact', data, headers={'X-Real-IP': '8.8.4.5'}), range(2)))
        self.assertEqual(sorted(result[0] for result in results), [201, 400])
        created = next(result[1] for result in results if result[0] == 201)
        self.call('DELETE', '/api/admin/contact/' + created['id'], expected=204, auth=token())

    def test_contact_length_and_ip_budget(self):
        headers = {'X-Real-IP': '203.0.113.185'}
        base = {'name': 'reader', 'email': 'bounded@example.test', 'message': 'hello'}
        for field, value in [('name', '홍' * 201), ('email', 'a' * 250 + '@example.test'), ('message', '글' * 10001)]:
            with self.subTest(field=field):
                self.call('POST', '/api/contact', dict(base, **{field: value}), 400, headers=headers)
        boundary = dict(base, name='홍' * 200, message='글' * 10000)
        row, _ = self.call('POST', '/api/contact', boundary, 201, headers=headers)
        self.call('DELETE', '/api/admin/contact/' + row['id'], expected=204, auth=token())
        for index in range(19):
            row, _ = self.call('POST', '/api/contact', dict(base, email=f'rotating-{index}@example.test'), 201, headers=headers)
            self.call('DELETE', '/api/admin/contact/' + row['id'], expected=204, auth=token())
        self.call('POST', '/api/contact', dict(base, email='another-address@example.test'), 429, headers=headers)

    def test_bans_and_admin_bypass(self):
        self.call('POST', '/api/admin/bans/ips', {'ip': '127.0.0.1'}, 400, token())
        self.call('POST', '/api/admin/bans/users', {'login': 'helloworld0822'}, 400, token())
        self.call('POST', '/api/admin/bans/users', {'login': 'bad_login'}, 400, token())
        row, _ = self.call('POST', '/api/admin/bans/ips', {'ip': '8.8.8.8', 'duration_hours': 0}, 201, token())
        self.assertIsNotNone(row['expires_at'])
        self.call('GET', '/api/health', expected=403, headers={'X-Real-IP': '8.8.8.8'})
        self.call('GET', '/api/admin/bans', auth=token(), headers={'X-Real-IP': '8.8.8.8'})
        self.call('DELETE', '/api/admin/bans/ips/8.8.8.8', expected=204, auth=token())
        self.call('POST', '/api/admin/bans/users', {'login': 'blocked-reader', 'reason': 'test'}, 201, token())
        self.call('POST', '/api/admin/bans/users', {'login': 'BLOCKED-READER', 'reason': 'updated'}, 201, token())
        bans, _ = self.call('GET', '/api/admin/bans', auth=token())
        self.assertTrue(any(row['reason'] == 'updated' for row in bans['users']))
        post = self.post()
        self.call('POST', f"/api/posts/{post['id']}/comments", {'body': 'blocked'}, 403, token('blocked-reader', 'user'))
        _, headers = self.oauth('blocked')
        self.assertEqual(headers['Location'], 'http://frontend.test/?error=blocked')
        self.call('DELETE', '/api/admin/bans/users/blocked-reader', expected=204, auth=token())

    def test_ipv6_normalization(self):
        self.call('POST', '/api/admin/bans/ips', {'ip': '2001:4860:4860:0000:0000:0000:0000:8888'}, 201, token())
        self.call('GET', '/api/health', expected=403, headers={'X-Real-IP': '2001:4860:4860::8888'})
        self.call('DELETE', '/api/admin/bans/ips/2001:4860:4860::8888', expected=204, auth=token())

    def test_public_read_ban_changes_are_immediate(self):
        paths = ('/api/health', '/api/posts', '/api/projects', '/api/timeline')
        headers = {'X-Real-IP': '8.8.8.9'}
        for path in paths:
            self.call('GET', path, headers=headers)
        for _ in range(2):
            self.call('POST', '/api/admin/bans/ips', {'ip': '8.8.8.9'}, 201, token())
            try:
                for path in paths:
                    self.call('GET', path, expected=403, headers=headers)
                    self.call('GET', path, headers=headers, auth=token())
                    self.call('GET', path, expected=403, headers=headers, auth=token(secret='wrong'))
            finally:
                self.call('DELETE', '/api/admin/bans/ips/8.8.8.9', expected=204, auth=token())
            for path in paths:
                self.call('GET', path, headers=headers)

    @unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'disposable DB required')
    def test_public_read_expired_ban_and_database_failure(self):
        database = os.environ['TEST_DATABASE_URL']
        def sql(command):
            subprocess.run(['psql', database, '-v', 'ON_ERROR_STOP=1', '-c', command],
                           check=True, capture_output=True)
        paths = ('/api/health', '/api/posts', '/api/projects', '/api/timeline')
        headers = {'X-Real-IP': '8.8.8.10'}
        sql("INSERT INTO banned_ips(ip,expires_at) VALUES('8.8.8.10',now()-interval '1 second')")
        try:
            for path in paths:
                self.call('GET', path, headers=headers)
            sql("UPDATE banned_ips SET expires_at=NULL WHERE ip='8.8.8.10'")
            for path in paths:
                self.call('GET', path, expected=403, headers=headers)
            sql("UPDATE banned_ips SET expires_at=now()-interval '1 second' WHERE ip='8.8.8.10'")
            for path in paths:
                self.call('GET', path, headers=headers)
        finally:
            sql("DELETE FROM banned_ips WHERE ip='8.8.8.10'")
        sql('ALTER TABLE banned_ips RENAME TO unavailable_banned_ips')
        try:
            for path in paths:
                self.call('GET', path, expected=500)
        finally:
            sql('ALTER TABLE unavailable_banned_ips RENAME TO banned_ips')
        for path in paths:
            self.call('GET', path)

    @unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'disposable DB required')
    def test_public_read_concurrent_authoritative_bans(self):
        database = os.environ['TEST_DATABASE_URL']
        def sql(command):
            subprocess.run(['psql', database, '-v', 'ON_ERROR_STOP=1', '-c', command],
                           check=True, capture_output=True)
        paths = ('/api/health', '/api/posts', '/api/projects', '/api/timeline')
        headers = {'X-Real-IP': '8.8.8.11'}
        def check(status):
            cases = [(path, auth, 200 if auth == admin else status)
                     for path in paths for auth in (None, token(secret='wrong'), admin)]
            def call(case):
                path, auth, expected = case
                return self.call('GET', path, expected=expected, auth=auth, headers=headers)
            with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
                list(executor.map(call, cases))
        admin = token()
        renamed = False
        try:
            sql("INSERT INTO banned_ips(ip) VALUES('8.8.8.11')")
            check(403)
            sql("UPDATE banned_ips SET expires_at=now()-interval '1 second' WHERE ip='8.8.8.11'")
            check(200)
            sql("DELETE FROM banned_ips WHERE ip='8.8.8.11'")
            check(200)
            sql('ALTER TABLE banned_ips RENAME TO unavailable_banned_ips')
            renamed = True
            check(500)
            sql('ALTER TABLE unavailable_banned_ips RENAME TO banned_ips')
            renamed = False
            check(200)
        finally:
            if renamed:
                sql('ALTER TABLE unavailable_banned_ips RENAME TO banned_ips')
            sql("DELETE FROM banned_ips WHERE ip='8.8.8.11'")

    @unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'disposable DB required')
    def test_comment_post_index_restored(self):
        sql = "SELECT i.indisvalid AND i.indisready, pg_get_indexdef(i.indexrelid) FROM pg_index i WHERE i.indrelid='comments'::regclass AND i.indexrelid='comments_post_id_created_at_idx'::regclass"
        result = subprocess.run(['psql', os.environ['TEST_DATABASE_URL'], '-v', 'ON_ERROR_STOP=1',
                                 '-Atc', sql], check=True, capture_output=True, text=True)
        self.assertTrue(result.stdout.startswith('t|'), result.stdout)
        self.assertIn('USING btree (post_id, created_at)', result.stdout)

    def test_oauth_login_callback_and_safe_return(self):
        _, headers = self.call('GET', '/api/auth/github/login?state=/blog', expected=302)
        self.assertIn('/login/oauth/authorize?', headers['Location'])
        self.assertIn('state=', headers['Location'])
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.call('GET', '/api/auth/github/callback?code=admin', expected=302)
        _, headers = self.oauth('admin')
        self.assertTrue(headers['Location'].startswith('http://frontend.test/admin#token='))
        jwt = headers['Location'].split('#token=', 1)[1]
        self.call('GET', '/api/admin/posts', auth=jwt)
        _, headers = self.oauth('user', '/blog')
        self.assertTrue(headers['Location'].startswith('http://frontend.test/blog#token='))
        _, headers = self.oauth('user', '//evil.test')
        self.assertTrue(headers['Location'].startswith('http://frontend.test/#token='))
        _, headers = self.oauth('invalid')
        self.assertEqual(headers['Location'], 'http://frontend.test/?error=unauthorized')

    def test_oauth_return_paths_are_bounded_before_signing(self):
        for path in ['/\\evil.test', '/%2f%2fevil.test', '/blog?next=evil', '/blog#token=attacker',
                     '/blog\r\nX-Injected: yes', '/' + 'a' * 2048]:
            with self.subTest(path=path[:50]):
                _, headers = self.call('GET', '/api/auth/github/login?state=' + urllib.parse.quote(path, safe=''), expected=302)
                state = urllib.parse.parse_qs(urllib.parse.urlsplit(headers['Location']).query)['state'][0]
                payload = state.split('.')[1]
                claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
                self.assertEqual(claims['path'], '/')
                self.assertLess(len(state), 4096)
                cookie = headers['Set-Cookie'].split(';', 1)[0]
                _, callback = self.call('GET', '/api/auth/github/callback?code=user&state=' + urllib.parse.quote(state, safe=''), expected=302, headers={'Cookie': cookie})
                self.assertTrue(callback['Location'].startswith('http://frontend.test/#token='))

    def test_slow_github_does_not_hold_database_pool(self):
        pause = {'lock': threading.Lock(), 'count': 0,
                 'ready': threading.Event(), 'release': threading.Event()}
        MockGitHub.pause = pause
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                futures = [pool.submit(request, 'GET', '/api/admin/github/repos', auth=token())
                           for _ in range(1)]
                try:
                    self.assertTrue(pause['ready'].wait(timeout=8), 'GitHub request must be waiting')
                    start = time.perf_counter()
                    self.call('GET', '/api/health')
                    self.assertLess(time.perf_counter() - start, 1.5)
                finally:
                    pause['release'].set()
                self.assertTrue(all(f.result()[0] == 200 for f in futures))
        finally:
            pause['release'].set()
            MockGitHub.pause = None

    def test_github_repository_importer(self):
        repos, _ = self.call('GET', '/api/admin/github/repos', auth=token())
        self.assertEqual([row['name'] for row in repos], ['hidden', 'public'])
        self.assertIn('is_private', repos[0])
        self.assertEqual(repos[0]['owner'], 'test')

    def test_upload_authorization_and_file_serving(self):
        boundary = 'forge-boundary'
        payload = b'fake-png-content'
        raw = b'--' + boundary.encode() + b'\r\nContent-Disposition: form-data; name="file"; filename="../../image.png"\r\nContent-Type: image/png\r\n\r\n' + payload + b'\r\n--' + boundary.encode() + b'--\r\n'
        headers = {'Content-Type': 'multipart/form-data; boundary=' + boundary}
        self.call('POST', '/api/admin/uploads', expected=401, raw=raw, headers=headers)
        row, _ = self.call('POST', '/api/admin/uploads', expected=201, auth=token(), raw=raw, headers=headers)
        self.assertRegex(row['url'], r'^/uploads/[a-f0-9-]{36}\.png$')
        body, response_headers = self.call('GET', row['url'])
        self.assertEqual(body, payload)
        self.assertEqual(response_headers['Content-Type'], 'image/png')
        self.call('GET', '/uploads/%2e%2e%2f.env', expected=404)
        self.call('POST', '/api/admin/uploads', expected=400, auth=token(), raw=raw.replace(b'image.png', b'evil.exe'), headers=headers)

    def test_upload_size_limit(self):
        boundary = 'forge-large-boundary'
        raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\n\r\n'.encode()
               + b'x' * (20 * 1024 * 1024 + 1) + f'\r\n--{boundary}--\r\n'.encode())
        self.call('POST', '/api/admin/uploads', expected=413, auth=token(), raw=raw,
                  headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})

    def test_openapi_and_docs(self):
        schema, _ = self.call('GET', '/api/openapi.json')
        self.assertEqual(schema['openapi'], '3.0.3')
        self.assertIn('/api/admin/posts', schema['paths'])
        body, headers = self.call('GET', '/api/docs/')
        self.assertIn(b'SwaggerUIBundle', body)
        self.assertTrue(headers['Content-Type'].startswith('text/html'))

    def test_pool_concurrency_and_error_recovery(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(lambda _: request('GET', '/api/posts'), range(80)))
        self.assertTrue(all(result[0] == 200 for result in results))
        self.call('PUT', '/api/admin/posts/999999999999', {'title': 'x'}, 404, token())
        self.call('GET', '/api/health')


if __name__ == '__main__':
    mock = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('MOCK_PORT', 19090))), MockGitHub)
    thread = threading.Thread(target=mock.serve_forever, daemon=True)
    thread.start()
    try:
        unittest.main(verbosity=2)
    finally:
        mock.shutdown()
        mock.server_close()
