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
  Database: Database,
  "CI/CD": Workflow,
  "Algorithm & Embedded": Cpu,
};

export const skillIcons: Record<string, [SkillIconComponent, string]> = {
  "JS/TS": [SiJavascript, "#846900"],
  React: [SiReact, "#087b8c"],
  "Next.js": [SiNextdotjs, "#202423"],
  "HTML / CSS": [SiHtml5, "#af432a"],
  "Tailwind CSS": [SiTailwindcss, "#08778a"],
  Bootstrap: [SiBootstrap, "#634096"],
  "Material UI": [SiMui, "#1862a0"],
  Rust: [SiRust, "#403b35"],
  Axum: [SiTokio, "#395148"],
  Actix: [SiActix, "#39463f"],
  Python: [SiPython, "#285f86"],
  FastAPI: [SiFastapi, "#087965"],
  Elixir: [SiElixir, "#704588"],
  Phoenix: [SiPhoenixframework, "#a8461e"],
  PostgreSQL: [SiPostgresql, "#386284"],
  MySQL: [SiMysql, "#356983"],
  SQLite: [SiSqlite, "#2c6482"],
  RabbitMQ: [SiRabbitmq, "#a84916"],
  Redis: [SiRedis, "#a8362c"],
  Docker: [SiDocker, "#146698"],
  Podman: [SiPodman, "#84418a"],
  Kubernetes: [SiKubernetes, "#2f5a9e"],
  AWS: [FaAws, "#895b18"],
  "GitHub Actions": [SiGithubactions, "#2d62a4"],
  C: [SiC, "#455776"],
  "C++": [SiCplusplus, "#2b6190"],
  Arduino: [SiArduino, "#127371"],
  "Raspberry Pi": [SiRaspberrypi, "#964164"],
};

type SkillIconProps = {
  name: string;
  className?: string;
};

export const SkillIcon = ({ name, className = "size-5 shrink-0" }: SkillIconProps) => {
  const skill = skillIcons[name];
  if (!skill) return null;
  const [Icon, color] = skill;
  return <Icon className={className} color={color} aria-hidden />;
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
