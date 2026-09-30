import base64
import concurrent.futures
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
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
        path = urllib.parse.urlsplit(self.path).path
        if path == '/user':
            bearer = self.headers.get('Authorization', '')
            login = {'Bearer mock-admin': 'Helloworld0822', 'Bearer mock-user': 'reader',
                     'Bearer mock-blocked': 'blocked-reader'}.get(bearer)
            self.send({'login': login, 'avatar_url': 'https://avatar.test/a.png'} if login else {}, 200 if login else 401)
        elif path in ('/users/Helloworld0822/repos', '/user/repos', '/orgs/test/repos', '/users/test/repos'):
            self.send([{'name': 'public', 'full_name': 'test/public', 'html_url': 'https://github.com/test/public',
                        'description': 'demo', 'language': 'Forge', 'private': False, 'owner': {'login': 'test'}},
                       {'name': 'hidden', 'full_name': 'test/hidden', 'html_url': 'https://github.com/test/hidden',
                        'description': None, 'language': None, 'private': True, 'owner': {'login': 'test'}}])
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
