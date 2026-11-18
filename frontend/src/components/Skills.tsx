import { useReveal } from "../lib/useReveal";

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
    category: "Database",
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

export default function Skills() {
  const { ref, className } = useReveal<HTMLElement>();
  return (
    <section id="skills" ref={ref} className={className} aria-labelledby="stack-heading">
      <h2 id="stack-heading" className="section-heading">기술 스택</h2>
      <dl className="stack-list">
        {skillGroups.map(group => (
          <div key={group.category}>
            <dt>{group.category}</dt>
            <dd>{group.items.map(skill => (
              <span key={skill.name}>{skill.name}{skill.children && <small> ({skill.children.join(", ")})</small>}</span>
            ))}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
