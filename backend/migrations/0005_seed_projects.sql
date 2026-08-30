-- Seed the portfolio with the projects that previously lived in the
-- frontend's hardcoded array (src/components/Projects.tsx). Published so the
-- API-driven Projects section renders them immediately on first deploy.
INSERT INTO projects (title, description, details, tags, status, period, role, url, published) VALUES
(
    'AutoForge',
    'PDF 계획서를 업로드하면 AI 파이프라인이 요약·기획·디자인·구현까지 자동 실행하는 외주 자동화 프로그램.',
    ARRAY[
        'Haiku → Sonnet → Stitch → Codex 5.3 순서의 AI 파이프라인을 구성했습니다.',
        'Rust(Actix-web) 백엔드와 React + Vite 프론트엔드로 구현했습니다.',
        'Docker / Nginx 기반으로 배포 환경을 구성했습니다.'
    ],
    ARRAY['Rust', 'React', 'TypeScript', 'Docker'],
    '진행 중',
    '2026',
    '개인 프로젝트',
    'https://github.com/Helloworld0822/AutoForge',
    true
),
(
    'Rental Web',
    'Rust + Elixir 스택으로 구축한 단일 테넌트 렌탈 마켓플레이스. 라즈베리파이부터 클라우드까지 확장 가능.',
    ARRAY[
        'Raspberry Pi 5 및 Kubernetes 환경에서 동작하도록 설계했습니다.',
        'Rust와 Elixir를 조합한 풀스택 아키텍처를 적용했습니다.',
        'Oracle Cloud 무료 티어까지 코드 변경 없이 스케일업이 가능합니다.'
    ],
    ARRAY['Rust', 'Elixir', 'Kubernetes'],
    '진행 중',
    '2025 — 2026',
    '개인 프로젝트',
    'https://github.com/Helloworld0822/rental_web',
    true
),
(
    'Taskloops',
    '할 일 관리 플랫폼. Elixir 백엔드, React 프론트엔드, E2E 테스트, Docker/K8s 배포 환경으로 구성.',
    ARRAY[
        'Elixir 백엔드 API와 React(Vite) 프론트엔드를 개발했습니다.',
        'Playwright 기반 E2E 테스트 스위트를 구축했습니다.',
        'Docker Compose, nginx gateway, Kubernetes 매니페스트를 포함한 플랫폼 레포를 운영합니다.'
    ],
    ARRAY['Elixir', 'React', 'TypeScript', 'Docker'],
    '진행 중',
    '2026',
    'Taskloops',
    'https://github.com/Taskloops',
    true
),
(
    'Forge',
    'Forge 프로그래밍 언어 생태계 — 컴파일러·런타임, LSP, VS Code/Cursor 확장.',
    ARRAY[
        'C로 컴파일러, 런타임, 표준 라이브러리를 구현했습니다.',
        'TypeScript 기반 Language Server Protocol을 제공합니다.',
        'VS Code 및 Cursor용 확장 프로그램을 개발했습니다.'
    ],
    ARRAY['C', 'TypeScript', 'LSP'],
    '진행 중',
    '2026',
    'forge-language',
    'https://github.com/forge-language',
    true
),
(
    '2026 Mini Project',
    '2026 미니 프로젝트. Elixir 백엔드와 TypeScript 프론트엔드 풀스택 구성.',
    ARRAY[
        'Elixir 기반 백엔드 API를 개발했습니다.',
        'TypeScript 프론트엔드와 연동했습니다.'
    ],
    ARRAY['Elixir', 'TypeScript'],
    '완료',
    '2026',
    '2026-mini-project',
    'https://github.com/2026-mini-project',
    true
),
(
    'Web IDE',
    '브라우저에서 동작하는 웹 기반 IDE 프로젝트.',
    ARRAY[
        'TypeScript 기반으로 웹 IDE 환경을 구현했습니다.',
        '코드 편집 및 개발 워크플로우를 브라우저에서 제공합니다.'
    ],
    ARRAY['TypeScript', 'React'],
    '완료',
    '2026',
    '개인 프로젝트',
    'https://github.com/Helloworld0822/web_ide',
    true
),
(
    'DayFlow',
    '일정과 업무 흐름을 관리하는 웹 애플리케이션.',
    ARRAY[
        'TypeScript와 React로 프론트엔드를 구축했습니다.',
        '사용자 일정 관리 기능을 중심으로 설계했습니다.'
    ],
    ARRAY['TypeScript', 'React'],
    '완료',
    '2025 — 2026',
    '개인 프로젝트',
    'https://github.com/Helloworld0822/DayFlow',
    true
),
(
    'ChatGend',
    'AI 기반 채팅 생성 및 관리 웹 서비스.',
    ARRAY[
        'TypeScript 기반 풀스택 웹 애플리케이션입니다.',
        '채팅 생성 및 관리 기능을 제공합니다.'
    ],
    ARRAY['TypeScript', 'React'],
    '완료',
    '2025 — 2026',
    '개인 프로젝트',
    'https://github.com/Helloworld0822/ChatGend',
    true
),
(
    'Crackseal',
    '선린톤 해커톤 프로젝트. Crackseal 서비스 개발.',
    ARRAY[
        '선린톤 해커톤용 Starter Kit을 제작했습니다.',
        'TypeScript 기반 Crackseal 프로젝트를 개발했습니다.'
    ],
    ARRAY['TypeScript', 'React'],
    '완료',
    '2026',
    'sunrinthon-jaemin40',
    'https://github.com/sunrinthon-jaemin40',
    true
),
(
    'Invest Web',
    '존 네프의 투자 방식을 한국 시장에 맞게 변형한 투자 분석 웹사이트.',
    ARRAY[
        'Rust로 백엔드 API와 투자 로직을 구현했습니다.',
        '유명 투자자 John Neff의 투자 전략을 한국 맥락에 맞게 적용했습니다.'
    ],
    ARRAY['Rust', 'Web'],
    '완료',
    '2025',
    '개인 프로젝트',
    'https://github.com/Helloworld0822/invest_web',
    true
);