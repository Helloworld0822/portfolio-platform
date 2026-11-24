import { CategoryIcon, SkillIcon } from "../lib/skillIcons";
import type { SkillGroup } from "../lib/profile";

export default function Skills({ groups }: { groups: SkillGroup[] }) {
  return <section id="skills">
    <h2 className="section-heading">기술 스택</h2>
    <p className="section-description">사용하는 도구와 기술 스택.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((group, index) => <article key={group.category} className={`stitch-card p-4 ${index < 3 ? "sm:col-span-2" : ""}`}>
        <h3 className="mb-3 flex items-center gap-2 text-headline-sm text-primary"><CategoryIcon category={group.category} />{group.category}</h3>
        <ul className="flex flex-wrap gap-2">
          {group.items.map(skill => <li key={skill.name} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-body-sm">
            <SkillIcon name={skill.name} className="size-4" /><strong>{skill.name}</strong>
            {skill.children?.map(child => <span key={child} className="text-secondary">{child}</span>)}
          </li>)}
        </ul>
      </article>)}
    </div>
  </section>;
}
