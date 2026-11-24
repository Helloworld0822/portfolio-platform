import type { Project } from "../lib/project";

export default function ProjectIcon({ project }: { project: Project }) {
  const icon = project.attachments?.find(item => item.kind === "icon");
  return icon ? <img src={icon.url} alt="" width={26} height={26} loading="lazy" className="mr-2 inline-block size-6 object-contain align-middle" /> : null;
}
