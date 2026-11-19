import { CategoryIcon, SkillIcon } from "../lib/skillIcons";
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
      <div className="skill-groups">
        {skillGroups.map(group => (
          <div className="skill-group" key={group.category}>
            <h3><CategoryIcon category={group.category} className="skill-category-icon" />{group.category}</h3>
            <ul className="skill-items">
              {group.items.map(skill => (
                <li key={skill.name}>
                  <div className="skill-name"><SkillIcon name={skill.name} />{skill.name}</div>
                  {skill.children && (
                    <ul className="skill-children">
                      {skill.children.map(child => (
                        <li key={child}><SkillIcon name={child} className="size-4 shrink-0" />{child}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
