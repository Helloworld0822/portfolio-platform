import { useState, type FormEvent } from "react";
import { authFetch } from "../../lib/api";
import type { Profile } from "../../lib/profile";
import { usePublicData } from "../../lib/usePublicData";

const labels = {
  name: "이름", englishName: "영문 이름", affiliation: "소속", statement: "한 줄 소개",
  bio: "소개", photo: "사진 주소", github: "GitHub 계정",
} as const;
const fields = Object.keys(labels) as (keyof typeof labels)[];

function ProfileForm({ profile }: { profile: Profile }) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    let skills: unknown;
    try { skills = JSON.parse(String(values.get("skills"))); }
    catch { setMessage("기술 스택의 JSON 형식을 확인해 주세요."); return; }
    setSaving(true);
    setMessage("");
    try {
      const response = await authFetch("/api/admin/profile", {
        method: "PUT", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({...Object.fromEntries(values), skills}),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "저장하지 못했습니다. 입력값과 로그인 상태를 확인해 주세요.");
      }
      setMessage("저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  const control = "mt-1 block w-full rounded-lg border border-border bg-white px-3 py-2";
  return <form onSubmit={save} className="grid gap-4">
    {fields.map(field => <label key={field} className="text-sm">{labels[field]}
      {field === "bio" ? <textarea className={control} name={field} defaultValue={profile[field]} rows={4} /> :
        <input className={control} name={field} defaultValue={profile[field]} required={["name","photo","github"].includes(field)} />}
    </label>)}
    <label className="text-sm">기술 스택 (JSON)<textarea className={control + " font-mono"} name="skills" rows={10} defaultValue={JSON.stringify(profile.skills, null, 2)} /></label>
    <div className="flex items-center gap-4"><button disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-white">{saving ? "저장 중…" : "저장"}</button><span role="status">{message}</span></div>
  </form>;
}

export default function ProfileManager() {
  const {data, status} = usePublicData<Profile>("/api/profile");
  return data ? <ProfileForm profile={data} /> : <p role="status">{status ? "소개를 불러오지 못했습니다." : "불러오는 중…"}</p>;
}
