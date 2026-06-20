import { useState, useEffect } from "react";
import type { UserRepo } from "@/lib/types";

export function useUserRepos(token: string | null) {
  const [repos, setRepos] = useState<UserRepo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setRepos([]); return; }
    setLoading(true);
    fetch(`/api/repos?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { repos?: UserRepo[] }) => setRepos(data.repos ?? []))
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, [token]);

  return { repos, loading };
}
