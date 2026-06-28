export type User = {
  name: string;
  phone: string;
  farmName: string;
  region: string;
  language: string;
};
export type Farm = {
  pondCount: number;
  fishCount: number;
  fishType: "Tilapia" | "Catfish" | "";
  fishSize: "Fingerling" | "Medium" | "Almost Harvest" | "";
  stockDate: string;
  lat?: number;
  lon?: number;
  pondPhotoAnalysis?: string;
};
export type FeedLog = { date: string; bags: number; notes?: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  ts: number;
};
export type Notif = { id: string; title: string; body: string; ts: number; read?: boolean; kind: "weather" | "feed" | "harvest" | "system" };

const K = {
  user: "ffo.user",
  farm: "ffo.farm",
  feed: "ffo.feedLogs",
  chat: "ffo.chat",
  notif: "ffo.notif",
  twi: "twiVoice",
  khaya: "khayaApiKey",
  dailyBriefing: "ffo.dailyBriefing",
  notifEnabled: "ffo.notifEnabled",
};

function read<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const v = window.localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}
function write<T>(k: string, v: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export const Store = {
  K,
  getUser: (): User | null => read<User | null>(K.user, null),
  setUser: (u: User | null) => write(K.user, u),
  getFarm: (): Farm =>
    read<Farm>(K.farm, { pondCount: 1, fishCount: 0, fishType: "", fishSize: "", stockDate: "" }),
  setFarm: (f: Farm) => write(K.farm, f),
  getFeed: (): FeedLog[] => read<FeedLog[]>(K.feed, []),
  setFeed: (l: FeedLog[]) => write(K.feed, l),
  getChat: (): ChatMessage[] => read<ChatMessage[]>(K.chat, []),
  setChat: (m: ChatMessage[]) => write(K.chat, m),
  getNotifs: (): Notif[] => read<Notif[]>(K.notif, []),
  setNotifs: (n: Notif[]) => write(K.notif, n),
  clearAll: () => {
    Object.values(K).forEach((k) => window.localStorage.removeItem(k));
  },
};

export function greetingForHour(h: number) {
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}
export function fmtGHS(n: number) {
  return "GHS " + Math.round(n).toLocaleString("en-GH");
}
export function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "long" });
}
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
export function firstName(name: string) {
  return name.split(/\s+/)[0] ?? "";
}
export function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}
