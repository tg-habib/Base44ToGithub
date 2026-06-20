export type GhSession = {
  token: string;
  login: string;
  avatar_url: string;
};

export type SavedApp = {
  id: string;
  nickname: string;
  appId: string;
  apiKey: string;
};

export type PushHistoryItem = {
  id: string;
  date: string;
  repo: string;
  commitUrl: string;
  filesCount: number;
  appId: string;
};

export type UserRepo = {
  name: string;
  fullName: string;
  private: boolean;
  owner: string;
  description?: string | null;
};

export type StreamState =
  | { status: "idle" }
  | { status: "running"; logs: string[] }
  | { status: "done"; logs: string[]; commitUrl: string; filesCount: number }
  | { status: "error"; logs: string[]; message: string };

export type AppView = "eject" | "schema" | "manual" | "history" | "faq";
