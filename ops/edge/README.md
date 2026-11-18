# Portfolio 도메인 게이트웨이

Cloudflare Worker가 세 도메인의 요청을 서울 Cloud Run의 고정 HTTPS 주소로 전달한다. Worker는 방문자의 로그인 헤더와 쿠키를 보존하고 Cloud Run 호출용 Google ID 토큰을 별도 헤더에 담는다. nginx가 신뢰하는 `X-Portfolio-Client-IP`는 Cloudflare가 기록한 방문자 IP로 덮어쓴다. 인증·쿠키·API 응답에는 `private, no-store`를 설정한다.

각 Cloudflare 데이터센터는 익명 GET 요청의 `/assets/` 해시 JS·CSS를 호스트별로 저장한다. nginx가 올바른 콘텐츠 형식과 `public, immutable`을 반환한 경우에만 저장한다. 캐시는 압축하지 않은 원본을 사용하며 방문자에게 전송하는 압축은 Cloudflare가 협상한다. 쿼리·쿠키·인증·범위·조건부 요청은 직접 원본으로 전달한다. 번들의 `X-Portfolio-Asset-Cache: HIT`는 해당 요청이 Google 토큰 발급과 Cloud Run 호출을 모두 생략했음을 나타낸다.

| 설정 | 값 |
|---|---|
| `RUN_ORIGIN` | Cloud Run의 HTTPS `run.app` 서비스 주소 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 해당 서비스에만 `roles/run.invoker`를 가진 Worker 전용 서비스 계정 |
| `GOOGLE_PRIVATE_KEY` | Wrangler secret에 보관하는 이 계정의 PKCS8 PEM 개인키 |
| `GOOGLE_AUDIENCE` | Cloud Run에서 허용하는 서비스 audience. 기본값은 `RUN_ORIGIN` |
| `TEST_HOST` | 스테이징 모드에서만 허용하는 단일 호스트 |

## 배포

`wrangler.jsonc`는 기본적으로 라우트, workers.dev, preview URL을 모두 끈다. 프로덕션 서비스의 도메인이나 IAM을 바꾸기 전에 별도 Cloud Run 스테이징 서비스를 검증하려면 그 서비스 주소를 `RUN_ORIGIN`으로 지정한다. 아래 unrouted·staging 명령은 최초 연결에 사용한다. 운영 중인 Worker를 다시 검증할 때는 별도의 스테이징 Worker 이름과 호출 계정으로 테스트하고 운영 라우트를 유지한다. 프로젝트 루트에서 명령을 실행한다. 먼저 `GOOGLE_SERVICE_ACCOUNT_EMAIL`을 설정하고, 셸에서 Cloudflare 계정의 배포 권한을 인증한다.

```sh
node --test ops/edge/worker.test.mjs
edge_dir=$(mktemp -d)
node ops/edge/config.mjs unrouted > "$edge_dir/worker.json"
npx wrangler@4 deploy --config "$edge_dir/worker.json"
npx wrangler@4 secret put GOOGLE_PRIVATE_KEY --config "$edge_dir/worker.json" < "$PRIVATE_KEY_PEM_FILE"
node ops/edge/config.mjs staging edge-check.helloworld0822.xyz > "$edge_dir/staging.json"
npx wrangler@4 deploy --config "$edge_dir/staging.json"
```

스테이징에는 아직 DNS 레코드가 없는 이름을 선택한다. Cloud Run으로 직접 접근할 수 있는 인그레스를 구성하고 Invoker IAM 검사를 활성화한다. Cloud Run 서비스에는 공개 호출 권한을 제거하고 위 서비스 계정에 호출 권한을 부여한다. 스테이징에서 `/api/health`, `/api/projects`, 파일 경로, HTTP→HTTPS 리디렉션을 확인한다.

운영 DNS에는 `helloworld0822.xyz`, `portfolio.helloworld0822.xyz`, `blog.helloworld0822.xyz` 각각에 Cloudflare 프록시를 활성화한 A 레코드 `192.0.2.1`을 둔다. 이 주소는 자리표시자다. 각 호스트의 `/*`에 등록된 Worker Route가 먼저 요청을 받아 `RUN_ORIGIN`으로 전달한다. 스테이징 서비스 주소나 audience를 임시 사용했다면 운영 값으로 되돌리고 아래 구성을 배포한다. 세 도메인의 HTTPS, GitHub 로그인 콜백, 관리자 업로드를 확인한다.

```sh
node ops/edge/config.mjs production > "$edge_dir/production.json"
npx wrangler@4 deploy --config "$edge_dir/production.json"
```

운영 설정에는 테스트 도메인이 없다. 전환 후 임시 테스트 Custom Domain을 Cloudflare에서 해제하고, 별도 스테이징 Cloud Run 서비스를 사용했다면 검증 완료 후 해당 서비스와 전용 호출 권한을 정리한다.

키 교체 시 새 서비스 계정 키를 Worker secret에 반영하고 스테이징 또는 운영 헬스체크를 통과한 뒤 이전 키를 폐기한다. 공개 라우트의 장애를 진단할 때는 Cloud Run의 요청 로그와 Worker 상태 코드를 함께 확인한다.
