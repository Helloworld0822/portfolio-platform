-- Timeline ("경력") entries, admin-managed. sort_order drives the public
-- ordering so the card list can be rearranged without touching created_at.
CREATE TABLE timeline_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    org TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the portfolio's current hardcoded timeline so the public page
-- keeps rendering the same cards after moving to DB-backed data.
INSERT INTO timeline_entries (period, title, org, description, sort_order) VALUES
('2026.02', 'Grizzly Hacks 2 우승', 'Grizzly Hacks', '해커톤에서 우승을 수상했습니다.', 0),
('2026.07', '선린톤 은상', '선린톤', 'Crackseal 프로젝트로 은상을 수상했습니다.', 1),
('2026.03 — 현재', 'TAPIE 4기 개발자', 'TAPIE', '동아리 웹·앱 프로젝트 개발에 참여하며, 여러 팀 프로젝트를 진행하고 있습니다.', 2),
('2026.03 — 현재', '소프트웨어과 121기', '선린인터넷고등학교', '풀스택 개발, 알고리즘 문제 풀이를 통해 Rust·Elixir 기반 개인 프로젝트를 꾸준히 진행하고 있습니다.', 3);