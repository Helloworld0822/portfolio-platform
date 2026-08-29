import { CategoryIcon, SkillIcon } from "../lib/skillIcons";

type SkillItem = {
  name: string;
  children?: string[];
};

type SkillGroup = {
  category: string;
  items: SkillItem[];
};

const skillGroups: SkillGroup[] = [
  {
    category: "Frontend",
    items: [
      { name: "JS/TS", children: ["React", "Next.js"] },
      { name: "HTML / CSS", children: ["Tailwind CSS", "Bootstrap", "Material UI"] },
    ],
  },
  {
    category: "Backend",
    items: [
      { name: "Rust", children: ["Axum", "Actix"] },
      { name: "Python", children: ["FastAPI"] },
      { name: "Elixir", children: ["Phoenix"] },
    ],
  },
  {
    category: "DataBase",
    items: [
      { name: "PostgreSQL" },
      { name: "MySQL" },
      { name: "SQLite" },
      { name: "RabbitMQ" },
      { name: "Redis" },
    ],
  },
  {
    category: "CI/CD",
    items: [
      { name: "Docker" },
      { name: "Podman" },
      { name: "Kubernetes" },
      { name: "AWS" },
      { name: "GitHub Actions" },
    ],
  },
  {
    category: "Algorithm & Embedded",
    items: [
      { name: "C" },
      { name: "C++" },
      { name: "Arduino" },
      { name: "Raspberry Pi" },
    ],
  },
];

const Skills = () => {
  return (
    <section id="skills" className="px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold tracking-tight text-navy">기술</h2>
        <p className="mt-2 text-ink-muted">사용하는 도구와 기술 스택.</p>
      </div>

      <div className="mx-auto mt-10 w-full max-w-[100rem]">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {skillGroups.map((group) => (
            <div
              key={group.category}
              className="rounded-lg border border-border bg-canvas p-8 shadow-card"
            >
              <h3 className="flex items-center gap-2 text-base font-semibold tracking-wide text-ink-muted uppercase">
                <CategoryIcon category={group.category} />
                {group.category}
              </h3>
              <ul className="mt-5 flex flex-col gap-3">
                {group.items.map((skill) => (
                  <li
                    key={skill.name}
                    className="rounded-md border border-border bg-surface-1 px-5 py-3.5 text-base text-ink"
                  >
                    <div className="flex items-center gap-3">
                      <SkillIcon name={skill.name} className="size-5 shrink-0 text-ink-muted" />
                      <span>{skill.name}</span>
                    </div>
                    {skill.children && (
                      <ul className="mt-3 flex flex-col gap-2 border-l-2 border-border pl-4">
                        {skill.children.map((child) => (
                          <li
                            key={child}
                            className="flex items-center gap-2 text-sm text-ink-muted md:text-base"
                          >
                            <SkillIcon name={child} className="size-4 shrink-0" />
                            {child}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Skills;
