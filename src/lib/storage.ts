export type User = {
  name: string;
  phone: string;
  farmName: string;
  region: string;
  language: string;
  avatar?: string;
};
export type ExtraFish = { type: string; count: number };
export type Farm = {
  pondCount: number;
  fishCount: number;
  fishType: string;
  fishSize: "Fingerling" | "Medium" | "Almost Harvest" | "";
  stockDate: string;
  lat?: number;
  lon?: number;
  pondPhotoAnalysis?: string;
  extraFish?: ExtraFish[];
};
export type FeedLog = { date: string; bags: number; notes?: string };
export type PondLog = {
  id: string;
  date: string;
  waterColor: "clear" | "green" | "brown" | "murky" | "";
  phLevel: string;
  temp: string;
  fishBehavior: "normal" | "surfacing" | "sluggish" | "feeding-well" | "";
  notes: string;
  photo?: string;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  ts: number;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  ts: number; // last updated
};
export type Notif = { id: string; title: string; body: string; ts: number; read?: boolean; kind: "weather" | "feed" | "harvest" | "system" | "ai" };

export type FishListing = {
  id: string;
  sellerName: string;
  sellerPhone: string;
  region: string;
  fishType: string;
  quantity: number;
  pricePerKg: number;
  description: string;
  image?: string;
  ts: number;
  isBuying: boolean; // true = buyer looking to buy, false = seller listing fish
};

const K = {
  user: "ffo.user",
  farm: "ffo.farm",
  feed: "ffo.feedLogs",
  chat: "ffo.chat",
  chatSessions: "ffo.chatSessions",
  notif: "ffo.notif",
  listings: "ffo.listings",
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
  getPondLogs: (): PondLog[] => read<PondLog[]>("ffo.pondLogs", []),
  setPondLogs: (l: PondLog[]) => write("ffo.pondLogs", l),
  getChat: (): ChatMessage[] => read<ChatMessage[]>(K.chat, []),
  setChat: (m: ChatMessage[]) => write(K.chat, m),
  getChatSessions: (): ChatSession[] => read<ChatSession[]>(K.chatSessions, []),
  setChatSessions: (s: ChatSession[]) => write(K.chatSessions, s),
  saveSession: (session: ChatSession) => {
    const sessions = read<ChatSession[]>(K.chatSessions, []);
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.unshift(session);
    // Keep max 20 sessions
    write(K.chatSessions, sessions.slice(0, 20));
  },
  getNotifs: (): Notif[] => read<Notif[]>(K.notif, []),
  setNotifs: (n: Notif[]) => write(K.notif, n),
  getListings: (): FishListing[] => read<FishListing[]>(K.listings, []),
  setListings: (l: FishListing[]) => write(K.listings, l),
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
