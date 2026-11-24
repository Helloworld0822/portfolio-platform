import { useEffect, useState } from "react";

export function usePublicData<T>(path: string) {
  const [result, setResult] = useState<{ path: string; data?: T; status: number }>();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal });
        const data = response.ok ? await response.json() as T : undefined;
        if (!controller.signal.aborted) setResult({ path, data, status: response.status });
      } catch {
        if (!controller.signal.aborted) setResult({ path, status: 503 });
      }
    }
    void load();
    return () => controller.abort();
  }, [path]);
  return result?.path === path ? result : { data: undefined, status: 0 };
}
