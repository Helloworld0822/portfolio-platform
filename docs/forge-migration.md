# Forge 서버 마이그레이션 결과

Rust 서버의 라우팅, 입력 검증, 권한 검사, SQL 및 OAuth 흐름을 Forge `.fg`
모듈로 구현했다. React 프런트엔드와 PostgreSQL 스키마는 그대로 사용한다.

## 구현 범위

- 게시글 공개/관리자 CRUD, 초안 숨김, 댓글 수 집계
- 프로젝트 CRUD, 첨부 파일, GitHub 저장소/계정 언어 및 비공개 정보
- 타임라인 CRUD 및 트랜잭션 기반 순서 변경
- 댓글 목록/작성/작성자 삭제/관리자 삭제, 길이 제한 및 차단 확인
- 문의 저장/조회/삭제/중복 제거, 동시 요청 중복 방지
- 관리자 JWT, GitHub OAuth, 로그인 차단, 안전한 복귀 경로
- IP/사용자 차단 CRUD, 관리자 IP 차단 우회, 속도 제한 및 자동 차단
- multipart 업로드, 용량/확장자 제한, 안전한 파일 제공
- CORS, health, OpenAPI 경로 문서 및 Swagger UI

데이터베이스 접근은 매개변수 쿼리를 사용한다. 연결은 풀에서 독점 대여하며,
미완료 트랜잭션은 반납 시 롤백한다. 기존 `_sqlx_migrations`의 버전과 성공
기록을 읽고, 새 마이그레이션 적용과 기록 저장을 동일 트랜잭션에서 처리한다.
마이그레이션은 advisory lock으로 직렬화한다. 이미 적용된 버전은 재실행하지 않는다.

PostgreSQL 모듈의 공개 API와 마이그레이션 흐름은 Forge다. 네트워크 프로토콜은
libpq에 연결한다. HTTP 파서·JSON·암호화도 libmicrohttpd/json-c/libcurl/OpenSSL
FFI를 사용한다. C 부분은 자원 소유권, 연결 풀, 파싱·암호화 및 OS 입출력을
담당하며, 포트폴리오의 SQL이나 권한 정책은 포함하지 않는다.

## Git 구조

`backend-forge/vendor/forge-postgres`와 `backend-forge/vendor/forge-web`는 별도
GitHub 저장소를 특정 커밋에 고정한 submodule이다. 수정은 해당 저장소에서
검증/커밋한 후 포트폴리오의 submodule 커밋을 갱신한다. CI는 recursive checkout을
사용한다. 변경된 Forge 컴파일러 소스도 함께 고정해 다른 환경에서 빌드할 수 있다.

## 동작 변경 및 한계

- OAuth 로그인에 서명된 `state`와 HttpOnly/SameSite 쿠키 검증을 추가했다.
  callback을 직접 호출하면 거절한다. 기존 프런트엔드의 login → GitHub → callback
  브라우저 흐름은 유지된다. HTTPS BACKEND_BASE_URL에서는 쿠키에 Secure를 설정한다.
- IPv6 및 IPv4-mapped IPv6 차단 주소를 정규화한다. 사설/루프백 주소 차단을 거절한다.
- 동시에 도착한 같은 문의는 이메일별 advisory lock으로 중복 저장을 막는다.
- 업로드는 요청당 파일 하나를 받는다. 실패/권한 거절 시 임시 파일을 삭제한다.
  SVG 등 직접 제공되는 파일에는 sandbox CSP와 nosniff 헤더를 적용한다.
- HTTP listen은 현재 IPv4다. TLS는 기존 nginx/Cloudflare 경로에서 종료한다.
- 연결/쿼리 제한과 GitHub timeout을 적용한다. 큰 기존 데이터에서 새 스키마
  마이그레이션이 필요하면 5초 제한을 고려해 별도 검증해야 한다.
- rate counter는 메모리 내 4096개 키이며 재시작 시 초기화된다. 차단 정보는 DB에 남는다.
- Forge 자체의 완전한 타입 검사/소유권 검사, 선점 스케줄링, supervisor 복구는
  별개로 미완성이다. 이 서버는 네이티브 HTTP worker와 libpq pool을 사용한다.
- 벤치마크로 Rust보다 빠르다는 주장은 하지 않는다. 실제 워크로드 성능 비교는
  별도 부하 시험이 필요하다.

## 검증

실제 PostgreSQL 16에서 HTTP 통합 테스트 18개를 실행한다. 세부 요청으로 CRUD,
초안, SQL 주입 문자열, 잘못된 JSON/타입, 서명·알고리즘·만료 JWT, OAuth/차단,
프로젝트 메타데이터, CORS, 파일 경로/권한/20 MiB 제한, 문의 동시 요청 및
80개 병렬 조회를 확인한다. 서버 재시작 후 마이그레이션 기록 10개가 유지되는지
확인한다. 독립 `.fg` PostgreSQL 테스트는 SQL NULL, 매개변수, 반납 시 롤백,
오류 복구, 마이그레이션 실패 롤백과 재실행 방지를 검사한다.

Forge Web C 경계 테스트는 1000번 JSON scope를 생성·정리하고 UTF-8/정수/IP 검증을
확인한다. Ubuntu에서 해당 경계를 AddressSanitizer/UndefinedBehaviorSanitizer로
검증한다. Forge 컴파일러 회귀 테스트도 함께 실행한다.

## 전환 절차

작업 브랜치를 검토한 뒤, submodule을 포함한 checkout에서 테스트한다:

```sh
GIT_MASTER=1 git submodule update --init --recursive
sh backend-forge/scripts/test-integration.sh
```

운영 DB/업로드의 백업과 staging 검증 후 승인된 배포에서 실행할 명령:

```sh
docker compose -f docker-compose.yml -f docker-compose.forge.yml up -d --build api
docker compose -f docker-compose.yml -f docker-compose.forge.yml up -d --force-recreate nginx
```

Rust로 되돌리는 명령:

```sh
docker compose -f docker-compose.yml up -d --build api
docker compose -f docker-compose.yml up -d --force-recreate nginx
```

이 작업에서는 운영 Compose, 운영 DB 및 실제 `.env`를 변경하지 않았다.
기존 main 자동 배포는 유지되며, Forge 사용은 override를 선택하는 별도 전환이다.
