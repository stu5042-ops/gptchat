# 친구 채팅 웹앱 — Cloudflare Worker + D1 (새 프로젝트)

이 폴더에는 웹 화면, API 서버 코드, Worker 설정, 그리고 **새 D1 데이터베이스용 SQL 실행 파일**이 전부 들어 있습니다. 기존 Pages Functions 전용 배포가 아닌 `src/index.js`를 진입점으로 사용하는 Worker 프로젝트입니다.

## 들어 있는 기능

- 이메일 가입 및 로그인, 로그아웃, 7일 로그인 세션
- 가입자 이름 검색
- 1:1 대화 생성 및 대화 목록
- 메시지 보내기, 답장, 좋아요
- 읽음/안 읽음 표시
- 내 대화 목록에서 대화 숨기기(상대방 기록과 메시지는 보존)
- 이미지 및 파일 첨부 (각 파일 최대 700KB, 메시지당 합계 최대 700KB)
- 기존 ChatGPT 스타일 밝은 UI, Think 버튼, 하단 안내 문구

> 첨부 파일은 새 D1의 메시지 행에 저장됩니다. 큰 파일이나 많은 사용자를 위한 서비스라면 이후 Cloudflare R2에 파일을 저장하도록 바꾸는 편이 좋습니다.

## 새로 시작할 때 전체 순서

### 1. 기존 리소스 정리

기존 Cloudflare Worker/Pages 프로젝트를 새것으로 교체하려면 Cloudflare 대시보드에서 기존 배포 프로젝트를 삭제한 다음 새 Worker를 만드세요. 기존 D1 데이터베이스까지 삭제하면 사용자 계정과 모든 채팅 데이터도 영구 삭제됩니다. **기존 데이터를 남겨둘 필요가 전혀 없는지 먼저 확인하세요.**

이 패키지는 Cloudflare 계정 안의 리소스를 직접 삭제하지 않습니다. 삭제/생성은 Cloudflare 대시보드에서 진행해야 합니다.

### 2. GitHub에 새 저장소 만들기

1. ZIP을 내려받아 압축을 풉니다.
2. 압축을 푼 폴더 안의 파일과 폴더를 새 GitHub 저장소의 **최상위(root)** 에 올립니다. `src`, `public`, `functions`, `migrations`, `wrangler.toml`, `database.sql`이 저장소 첫 화면에 보여야 합니다.
3. `wrangler.toml`의 `name = "friend-chat-app"` 값을 기억하세요. Cloudflare에서 Worker 이름을 다르게 만들면 이 값을 같은 이름으로 수정하고 GitHub에 반영해야 합니다.

### 3. 새 D1 데이터베이스 만들기

1. Cloudflare 대시보드 → **Storage & databases → D1 SQL database**(메뉴 이름은 계정 화면에서 약간 다를 수 있음)로 이동합니다.
2. 새 데이터베이스를 만들고 예를 들어 `friend-chat-db`라고 이름을 지정합니다.
3. 데이터베이스의 **Console** 또는 SQL 실행 화면을 엽니다.
4. 이 프로젝트의 `database.sql` 파일을 열어 전체 내용을 복사해 Console에 붙여넣고 실행합니다.
5. 성공적으로 실행되면 `users`, `sessions`, `conversations`, `conversation_members`, `messages`, `message_likes`, `login_attempts` 테이블이 생성됩니다.

`database.sql`과 `migrations/0001_initial.sql`은 같은 스키마입니다. **둘 다 실행하지 말고 하나만 실행하세요.** 새 데이터베이스에 한 번만 실행하면 됩니다.

### 4. GitHub를 새 Worker에 연결하기

1. Cloudflare → **Workers & Pages** → **Create** → **Worker** 흐름으로 새 Worker를 만들거나, 기존 Worker 서비스 대신 새 Worker 서비스를 준비합니다.
2. 새 Worker의 이름을 `friend-chat-app`으로 맞춥니다. 다른 이름을 원하면 GitHub 저장소의 `wrangler.toml`에서 `name`을 바꾸세요.
3. 해당 Worker의 **Settings → Builds**에서 GitHub 저장소를 연결합니다. 메뉴에 따라 처음부터 GitHub 기반 배포를 선택할 수도 있습니다.
4. Root directory는 `wrangler.toml`이 있는 프로젝트 루트로 지정합니다. Build command는 비워두고, Deploy command는 `npx wrangler deploy`를 사용합니다.
5. GitHub에 코드를 올리거나 수정해 푸시하면 Cloudflare가 배포하도록 설정합니다.

### 5. D1 설정 확인

이번 프로젝트는 D1 연결 정보를 `wrangler.toml`에 선언하도록 구성했습니다. GitHub에서 실행되는 Wrangler 배포는 설정 파일을 기준으로 배포 구성을 관리하므로, TOML에 `[[d1_databases]]` 항목이 있어야 합니다. `binding = "DB"`는 코드가 찾는 이름이므로 다른 이름으로 바꾸지 마세요. 위 단계에서 실제 `database_id`를 입력하면 이 바인딩이 Worker에 연결됩니다. 대시보드에서 같은 `DB` 바인딩을 중복으로 만들 필요는 없습니다.

정적 파일만 배포되는 Worker와 달리 이 프로젝트는 `src/index.js`가 API 요청을 처리하고 `public/` 파일을 정적 자산으로 제공합니다.

## 배포 확인

배포된 Worker 주소에 다음 경로를 직접 열어 확인하세요.

- `/api/auth/me` → `{"user":null}` 응답이면 API가 실행되고 D1 세션 조회도 정상입니다. 아직 로그인하지 않았다는 뜻입니다.
- `/api/auth/me` → `{"error":"D1 연결을 확인하세요."}` 응답이면 `wrangler.toml`의 `database_id`가 실제 D1 ID와 일치하는지, DB 이름이 `friend-chat-db`인지, 새 데이터베이스에서 `database.sql`을 실행했는지 확인하세요.
- `404` 또는 Worker 오류가 뜨면 배포 대상 저장소의 루트에 `wrangler.toml`과 `src/index.js`가 있는지, Deploy command가 Worker 배포를 하고 있는지 확인하세요.

정상 확인 후 웹사이트에서 다른 이메일 주소로 두 계정을 가입하면 친구 검색과 1:1 채팅을 테스트할 수 있습니다.

## 파일 구성

```text
friend-chat-cloudflare-fresh/
├── database.sql                  # 새 D1 Console에서 실행할 SQL
├── wrangler.toml                 # Cloudflare Worker 및 정적 자산 설정
├── src/index.js                  # 실제 Worker 진입점과 API 라우터
├── public/index.html             # 웹 UI
├── functions/                    # Worker에서 호출되는 인증/채팅 API 코드
│   ├── _lib/
│   └── api/
├── migrations/0001_initial.sql   # database.sql과 동일한 스키마
└── README.md
```
