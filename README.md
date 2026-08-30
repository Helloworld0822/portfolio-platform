# portfolio-platform

포트폴리오 사이트의 프론트엔드와 백엔드, 그리고 이를 묶어 실행하는 Compose 스택.

```
portfolio-platform/
├─ docker-compose.yml     # nginx + frontend + api + postgres
├─ .env.example           # api / postgres 환경변수 템플릿
├─ nginx/                 # 리버스 프록시 게이트웨이 (/api → api, / → frontend)
├─ frontend/              # React 19 + TypeScript + Vite + Tailwind 4
└─ backend/               # Rust + Actix-web 4 + sqlx + PostgreSQL 16
```

## 빠른 시작

```bash
cd portfolio-platform
cp .env.example .env      # JWT_SECRET, GITHUB_CLIENT_* 를 실제 값으로 채운다
docker compose up -d --build
```

- 사이트: <http://localhost>
- API 헬스체크: <http://localhost/api/health>
- **Swagger UI: <http://localhost/api/docs/>**
- OpenAPI 스펙: <http://localhost/api/openapi.json>

`podman compose` 도 동일하게 동작한다 (이미지 참조에 `docker.io/library/` 접두사를 붙여둠).

`HOST_HTTP_PORT` 로 호스트 포트를 바꿀 수 있다 (기본 80).

## 환경변수

`.env` 는 `api` 서비스의 `env_file` 이자 Compose 변수 치환에도 쓰인다.

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | 컨테이너 내부에서는 호스트가 `postgres` |
| `JWT_SECRET` | 관리자 JWT 서명 키. 반드시 긴 랜덤 문자열로 교체 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App 자격증명 |
| `ADMIN_GITHUB_USERNAME` | 이 GitHub 계정만 관리자로 통과 |
| `FRONTEND_URL` | OAuth 성공 후 돌아갈 프론트엔드 주소 |
| `BACKEND_BASE_URL` | OAuth `redirect_uri` 를 만들 때 쓰는 백엔드 주소 |
| `CORS_ALLOWED_ORIGINS` | 콤마로 구분된 허용 오리진 |
| `POSTGRES_*` | postgres 컨테이너 초기화 값 |
| `HOST_HTTP_PORT` | nginx 를 노출할 호스트 포트 |

GitHub OAuth App 의 Authorization callback URL 은
`{BACKEND_BASE_URL}/api/auth/github/callback` 로 등록해야 한다.

### 배포 후 GitHub OAuth 활성화 (1회)

사이트가 이미 public 도메인에 떠 있다면 (예: `https://blog.helloworld0822.site`):

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
   - Homepage URL: `https://<your-domain>`
   - Authorization callback URL: `https://<your-domain>/api/auth/github/callback`
2. Client ID / Client Secret 을 아래 스크립트에 전달 (`.env` 갱신 + api 컨테이너 재생성):

   ```bash
   scripts/enable-oauth.sh <CLIENT_ID> <CLIENT_SECRET>
   ```

3. `https://<your-domain>/admin` 에서 **GitHub으로 로그인** 시도.

`ADMIN_GITHUB_USERNAME` 과 일치하는 GitHub 계정만 `/admin` 대시보드에 접근할 수 있고,
다른 모든 GitHub 계정은 댓글 작성용 일반 사용자로 로그인된다.

## API

공개 엔드포인트는 인증이 필요 없고, `/api/admin/*` 는 `Authorization: Bearer <JWT>` 를 요구한다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/health` | 헬스체크 |
| GET | `/api/posts` | 발행된 글 목록 |
| GET | `/api/posts/{slug}` | 글 상세 (미발행은 404) |
| GET | `/api/projects` | 발행된 프로젝트 목록 |
| POST | `/api/contact` | 문의 폼 저장 |
| GET | `/api/auth/github/login` | GitHub 로그인 시작 |
| GET | `/api/auth/github/callback` | OAuth 콜백 |
| GET/POST | `/api/admin/posts` | 전체 글 조회 / 생성 |
| PUT/DELETE | `/api/admin/posts/{id}` | 수정 / 삭제 |
| GET/POST | `/api/admin/projects` | 전체 프로젝트 조회 / 생성 |
| PUT/DELETE | `/api/admin/projects/{id}` | 수정 / 삭제 |
| GET | `/api/admin/contact` | 받은 문의 목록 |

전체 스키마와 요청 예시는 Swagger UI(`/api/docs/`)에서 확인한다.

### 인증 흐름

1. 브라우저가 `/api/auth/github/login` 으로 이동 → GitHub 동의 화면
2. GitHub 가 `/api/auth/github/callback?code=...` 로 리다이렉트
3. 백엔드가 code → access token → 사용자 조회 후
   `ADMIN_GITHUB_USERNAME` 과 일치하는지 확인
4. 일치하면 `{FRONTEND_URL}#/admin?token=<JWT>` 로,
   아니면 `{FRONTEND_URL}#/admin?error=unauthorized` 로 리다이렉트

토큰을 쿠키가 아닌 URL 프래그먼트로 넘기는 이유는 크로스 오리진 쿠키(SameSite)
문제를 피하기 위함이다. 프래그먼트는 서버 로그에 남지 않는다. JWT 유효기간은 7일.

`POST /api/contact` 는 메일을 보내지 않고 DB(`contact_messages`)에만 저장한다.
받은 문의는 `GET /api/admin/contact` 로 확인한다.

## 로컬 개발

프론트엔드:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

백엔드 (Postgres 만 컨테이너로):

```bash
docker compose up -d postgres
cd backend
export DATABASE_URL=postgres://blog:blog@localhost:5432/portfolio_blog
export JWT_SECRET=dev-secret \
       GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... \
       ADMIN_GITHUB_USERNAME=Helloworld0822 \
       FRONTEND_URL=http://localhost:5173/ \
       BACKEND_BASE_URL=http://localhost:8080
cargo run          # http://localhost:8080
```

마이그레이션은 기동 시 자동 적용된다 (`backend/migrations/`).

### 테스트

```bash
cd backend
cargo test --lib                                            # DB 불필요
export DATABASE_URL=postgres://blog:blog@localhost:5432/portfolio_blog
cargo test                                                  # 통합 테스트 포함
```

통합 테스트는 `#[sqlx::test]` 를 쓰기 때문에 테스트마다 임시 DB 를 만들고 지운다.
따라서 `DATABASE_URL` 이 가리키는 서버에 DB 생성 권한이 필요하다.

```bash
cd frontend
npm run lint
npm run build
```
