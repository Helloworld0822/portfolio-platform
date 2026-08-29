import type { LucideIcon } from "lucide-react";
import { Cpu, Database, Layout, Server, Workflow } from "lucide-react";
import type { IconType } from "react-icons";
import { FaAws } from "react-icons/fa6";
import {
  SiActix,
  SiArduino,
  SiBootstrap,
  SiC,
  SiCplusplus,
  SiDocker,
  SiElixir,
  SiFastapi,
  SiGithubactions,
  SiHtml5,
  SiJavascript,
  SiKubernetes,
  SiMui,
  SiMysql,
  SiNextdotjs,
  SiPhoenixframework,
  SiPodman,
  SiPostgresql,
  SiPython,
  SiRabbitmq,
  SiRaspberrypi,
  SiReact,
  SiRedis,
  SiRust,
  SiSqlite,
  SiTailwindcss,
  SiTokio,
} from "react-icons/si";

type SkillIconComponent = IconType | LucideIcon;

export const categoryIcons: Record<string, LucideIcon> = {
  Frontend: Layout,
  Backend: Server,
  DataBase: Database,
  "CI/CD": Workflow,
  "Algorithm & Embedded": Cpu,
};

export const skillIcons: Record<string, SkillIconComponent> = {
  "JS/TS": SiJavascript,
  React: SiReact,
  "Next.js": SiNextdotjs,
  "HTML / CSS": SiHtml5,
  "Tailwind CSS": SiTailwindcss,
  Bootstrap: SiBootstrap,
  "Material UI": SiMui,
  Rust: SiRust,
  Axum: SiTokio,
  Actix: SiActix,
  Python: SiPython,
  FastAPI: SiFastapi,
  Elixir: SiElixir,
  Phoenix: SiPhoenixframework,
  PostgreSQL: SiPostgresql,
  MySQL: SiMysql,
  SQLite: SiSqlite,
  RabbitMQ: SiRabbitmq,
  Redis: SiRedis,
  Docker: SiDocker,
  Podman: SiPodman,
  Kubernetes: SiKubernetes,
  AWS: FaAws,
  "GitHub Actions": SiGithubactions,
  C: SiC,
  "C++": SiCplusplus,
  Arduino: SiArduino,
  "Raspberry Pi": SiRaspberrypi,
};

type SkillIconProps = {
  name: string;
  className?: string;
};

export const SkillIcon = ({ name, className = "size-5 shrink-0" }: SkillIconProps) => {
  const Icon = skillIcons[name];
  if (!Icon) return null;
  return <Icon className={className} aria-hidden />;
};

export const CategoryIcon = ({
  category,
  className = "size-5 shrink-0 text-primary",
}: {
  category: string;
  className?: string;
}) => {
  const Icon = categoryIcons[category];
  if (!Icon) return null;
  return <Icon className={className} aria-hidden />;
};
