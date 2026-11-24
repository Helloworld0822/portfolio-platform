export interface SkillGroup {
  category: string;
  items: { name: string; children?: string[] }[];
}

export interface Profile {
  name: string;
  englishName: string;
  affiliation: string;
  statement: string;
  bio: string;
  photo: string;
  github: string;
  skills: SkillGroup[];
}
