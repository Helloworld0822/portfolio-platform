CREATE TABLE portfolio_profile (
    singleton BOOLEAN PRIMARY KEY CHECK (singleton),
    content JSONB NOT NULL
);

INSERT INTO portfolio_profile VALUES (true, $profile$
{
  "name": "전재민",
  "englishName": "Jaemin Jeon",
  "affiliation": "선린인터넷고등학교 소프트웨어과 121기 · TAPIE 4기",
  "statement": "백엔드와 개발 도구를 만드는 풀스택 개발자입니다.",
  "bio": "선린인터넷고등학교 소프트웨어과 121기, TAPIE 4기 개발자로 활동하고 있습니다. Rust와 Elixir로 더 효율적인 시스템을 만드는 방법을 공부합니다.",
  "photo": "/images/jaemin.jpg",
  "github": "Helloworld0822",
  "skills": [
    {
      "category": "Frontend",
      "items": [
        {
          "name": "JS/TS",
          "children": [
            "React",
            "Next.js"
          ]
        },
        {
          "name": "HTML / CSS",
          "children": [
            "Tailwind CSS",
            "Bootstrap",
            "Material UI"
          ]
        }
      ]
    },
    {
      "category": "Backend",
      "items": [
        {
          "name": "Rust",
          "children": [
            "Axum",
            "Actix"
          ]
        },
        {
          "name": "Python",
          "children": [
            "FastAPI"
          ]
        },
        {
          "name": "Elixir",
          "children": [
            "Phoenix"
          ]
        }
      ]
    },
    {
      "category": "Database",
      "items": [
        {
          "name": "PostgreSQL"
        },
        {
          "name": "MySQL"
        },
        {
          "name": "SQLite"
        },
        {
          "name": "RabbitMQ"
        },
        {
          "name": "Redis"
        }
      ]
    },
    {
      "category": "CI/CD",
      "items": [
        {
          "name": "Docker"
        },
        {
          "name": "Podman"
        },
        {
          "name": "Kubernetes"
        },
        {
          "name": "AWS"
        },
        {
          "name": "GitHub Actions"
        }
      ]
    },
    {
      "category": "Algorithm & Embedded",
      "items": [
        {
          "name": "C"
        },
        {
          "name": "C++"
        },
        {
          "name": "Arduino"
        },
        {
          "name": "Raspberry Pi"
        }
      ]
    }
  ]
}
$profile$::jsonb);
