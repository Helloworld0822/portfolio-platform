export type ProjectAttachment = {
  name: string;
  url: string;
  kind: string;
};

export type Project = {
  id: string;
  title: string;
  description: string;
  details: string[];
  tags: string[];
  status: string;
  period?: string;
  role?: string;
  url?: string;
  demo_url?: string;
  repo_languages: Record<string, number>;
  repo_private: boolean;
  attachments?: ProjectAttachment[];
};
