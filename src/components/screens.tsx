import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Bell, MapPin, ChevronRight, Upload, Camera, Mic, Send, Image as ImageIcon,
  Calculator, Stethoscope, BarChart2, ShoppingBag, Tag, Cloud, CloudRain, Sun,
  Volume2, Layers, Fish, TrendingUp, TrendingDown, Minus, Plus, CheckCircle2,
  Trash2, ChevronLeft, Loader2, X, Settings as SettingsIcon, MessageCircle, Home as HomeIcon,
  LogIn, Phone, PhoneOff, Radio,
} from "lucide-react";
import {
  Store, type User, type Farm, type ChatMessage, type FeedLog, type Notif,
  greetingForHour, fmtGHS, fmtDate, initials, firstName, daysBetween,
} from "@/lib/storage";
import { fetchWeather, type WeatherSnapshot } from "@/lib/weather";
import { speak, recordAndTranscribe } from "@/lib/voice";
import {
  askAma, analyzePondImage, analyzeFishImage, generateBriefing,
  generateMarketPrices, generateWeatherAlerts, generateBuyers,
} from "@/lib/groq.functions";

const COLOR = {
  bg: "#0F0F12", card: "#18181C", card2: "#202027", text: "#F5F5F2",
  muted: "#8A8A92", gold: "#C89B5A", goldSoft: "#9A7448", warn: "#5E636B",
  div: "#2A2A31", nav: "#6B6B73", danger: "#E05555", ok: "#6BCB77",
};

export type Screen =
  | "splash" | "register" | "onboarding-1" | "onboarding-2" | "onboarding-3"
  | "dashboard" | "chat" | "feed-calc" | "fish-doctor" | "weather"
  | "market" | "sell" | "credit-score" | "profile" | "notifications";

const LANGS = ["English", "Twi", "Ga", "Ewe", "Hausa"] as const;
const REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Western North", "Central", "Eastern",
  "Volta", "Oti", "Northern", "Savannah", "North East", "Upper East",
  "Upper West", "Bono", "Bono East", "Ahafo",
];

// ============== Shared UI ==============
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full" style={{ background: COLOR.bg, color: COLOR.text }}>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col" style={{ background: COLOR.bg }}>
        {children}
      </div>
    </div>
  );
}

function Btn({
  children, onClick, variant = "outline", disabled, full = true, type,
}: {
  children: ReactNode; onClick?: () => void; variant?: "outline" | "solid" | "ghost";
  disabled?: boolean; full?: boolean; type?: "button" | "submit";
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl h-12 px-5 text-[14px] font-semibold transition-opacity disabled:opacity-50";
  const styles =
    variant === "solid"
      ? { background: COLOR.gold, color: COLOR.bg }
      : variant === "ghost"
      ? { background: "transparent", color: COLOR.gold }
      : { background: COLOR.card, color: COLOR.gold, border: `1px solid ${COLOR.goldSoft}` };
  return (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} style={styles} className={`${base} ${full ? "w-full" : ""}`}>
      {children}
    </button>
  );
}

function Card({ children, accent = false, className = "" }: { children: ReactNode; accent?: boolean; className?: string }) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{
        background: COLOR.card,
        border: `1px solid ${COLOR.div}`,
        borderLeft: accent ? `2px solid ${COLOR.gold}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

function TopBar({ onBack, title, right }: { onBack?: () => void; title?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3">
      {onBack ? (
        <button onClick={onBack} aria-label="Back" className="p-1 -ml-1"><ArrowLeft size={22} color={COLOR.text} /></button>
      ) : <div className="w-7" />}
      {title ? <div className="text-[15px] font-semibold" style={{ color: COLOR.text }}>{title}</div> : <div />}
      <div className="w-7 flex justify-end">{right}</div>
    </div>
  );
}

function Eyebrow({ children, gold = false }: { children: ReactNode; gold?: boolean }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: gold ? COLOR.gold : COLOR.muted }}>
      {children}
    </div>
  );
}

function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" color={COLOR.gold} />;
}

function AmaBubble({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: COLOR.card, border: `1px solid ${COLOR.div}`, borderLeft: `2px solid ${COLOR.gold}` }}
    >
      <Eyebrow gold>AMA</Eyebrow>
      <div className="mt-2 text-[15px] leading-relaxed" style={{ color: COLOR.text }}>{children}</div>
    </div>
  );
}

function Progress({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex gap-2 px-5 pt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < step ? COLOR.gold : COLOR.div }} />
      ))}
    </div>
  );
}

function Logo({ size = 64 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{ width: size, height: size, border: `1.5px solid ${COLOR.gold}` }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke={COLOR.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c2-4 6-6 10-6s7 2 9 5c-2 3-5 5-9 5s-8-2-10-4z" />
        <path d="M21 8l-3 4 3 4" />
        <circle cx="8" cy="11" r="0.7" fill={COLOR.gold} />
      </svg>
    </div>
  );
}

// ============== Bottom Nav ==============
export function BottomNav({ current, onGo, notifCount }: { current: Screen; onGo: (s: Screen) => void; notifCount: number }) {
  const items: { key: Screen; label: string; Icon: typeof HomeIcon }[] = [
    { key: "dashboard", label: "Home", Icon: HomeIcon },
    { key: "chat", label: "Chat", Icon: MessageCircle },
    { key: "notifications", label: "Alerts", Icon: Bell },
    { key: "profile", label: "Profile", Icon: SettingsIcon },
  ];
  return (
    <nav
      className="sticky bottom-0 left-0 right-0 px-4 pt-3 pb-6"
      style={{
        background: COLOR.card,
        borderTop: `1px solid ${COLOR.div}`,
        borderTopLeftRadius: 9,
        borderTopRightRadius: 9,
      }}
    >
      <ul className="flex items-center justify-around">
        {items.map(({ key, label, Icon }) => {
          const active = current === key;
          return (
            <li key={key}>
              <button onClick={() => onGo(key)} className="flex flex-col items-center gap-1 px-3 relative">
                <Icon size={22} color={active ? COLOR.gold : COLOR.nav} strokeWidth={1.75} />
                <span className="text-[10px]" style={{ color: active ? COLOR.gold : COLOR.nav }}>{label}</span>
                {key === "notifications" && notifCount > 0 && (
                  <span className="absolute -top-1 right-2 h-2 w-2 rounded-full" style={{ background: COLOR.danger }} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ============== Screens ==============
export function Splash({ onStart }: { onStart: () => void }) {
  const [lang, setLang] = useState<string>(() => (typeof window !== "undefined" && localStorage.getItem("ffo.lang")) || "English");
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("ffo.lang", lang); }, [lang]);
  return (
    <Shell>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Logo size={96} />
        <div className="mt-6 text-[24px] font-bold tracking-wider" style={{ color: COLOR.text }}>FISHFARM OS</div>
        <div className="mt-1 text-[12px] tracking-[0.18em] font-semibold" style={{ color: COLOR.gold }}>GHANA</div>
        <div className="mt-3 text-[13px]" style={{ color: COLOR.muted }}>Your Smart Fish Farm Assistant</div>

        <div className="mt-10 w-full">
          <Eyebrow>Choose language</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            {LANGS.map((l) => {
              const active = lang === l;
              return (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="px-4 h-9 rounded-full text-[13px]"
                  style={{
                    border: `1px solid ${active ? COLOR.gold : COLOR.div}`,
                    color: active ? COLOR.gold : COLOR.nav,
                    background: "transparent",
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10 w-full">
          <Btn onClick={onStart}>Get Started</Btn>
        </div>
      </div>
    </Shell>
  );
}

export function Register({ onBack, onDone }: { onBack: () => void; onDone: (u: User) => void }) {
  const lang = (typeof window !== "undefined" && localStorage.getItem("ffo.lang")) || "English";
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [farmName, setFarmName] = useState(""); const [region, setRegion] = useState(REGIONS[0]);
  const valid = name.trim() && phone.trim().length >= 7 && farmName.trim();
  return (
    <Shell>
      <TopBar onBack={onBack} />
      <div className="px-6 pb-8">
        <div className="text-[28px] font-light leading-tight" style={{ color: COLOR.text }}>Create Your</div>
        <div className="text-[36px] font-bold leading-[1.05]" style={{ color: COLOR.text }}>Account</div>
        <div className="mt-2 text-[13px]" style={{ color: COLOR.muted }}>Join thousands of Ghanaian fish farmers</div>

        <div className="mt-6 space-y-3">
          <Field label="Full Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} placeholder="Your name" /></Field>
          <Field label="Phone">
            <div className="flex items-center gap-2">
              <span className="text-[15px]" style={{ color: COLOR.gold }}>+233</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))} className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} placeholder="244000000" inputMode="numeric" />
            </div>
          </Field>
          <Field label="Farm Name"><input value={farmName} onChange={(e) => setFarmName(e.target.value)} className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} placeholder="e.g. Volta Lake Farm" /></Field>
          <Field label="Region">
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }}>
              {REGIONS.map((r) => <option key={r} value={r} style={{ background: COLOR.card }}>{r}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-6">
          <Btn disabled={!valid} onClick={() => onDone({ name: name.trim(), phone: phone.trim(), farmName: farmName.trim(), region, language: lang })}>Continue</Btn>
          <div className="mt-4 text-center text-[12px]" style={{ color: COLOR.muted }}>Already registered? <span style={{ color: COLOR.gold }}>Sign in</span></div>
        </div>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5"><Eyebrow>{label}</Eyebrow></div>
      <div className="rounded-xl px-4 h-12 flex items-center" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
        {children}
      </div>
    </label>
  );
}

// ---------- Onboarding 1: Pond photo ----------
export function Onboarding1({ user, onNext }: { user: User; onNext: (analysis?: string) => void; onSkip?: () => void }) {
  const analyze = useServerFn(analyzePondImage);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(() => Store.getFarm().pondPhotoAnalysis ?? null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setErr(null); setLoading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
      });
      const { analysis } = await analyze({ data: { imageBase64: dataUrl } });
      setAnalysis(analysis);
      const farm = Store.getFarm(); Store.setFarm({ ...farm, pondPhotoAnalysis: analysis });
    } catch {
      setErr("Ama is resting, please try again.");
    } finally { setLoading(false); }
  }

  return (
    <Shell>
      <Progress step={1} total={3} />
      <div className="px-6 pt-5 pb-8 space-y-5">
        <AmaBubble>Hi {firstName(user.name)}! I am Ama, your personal fish farming assistant. Before we begin, let me see your pond. Upload a photo and I will analyse it for you.</AmaBubble>

        <button onClick={() => fileRef.current?.click()} className="block w-full rounded-xl py-10 px-4 text-center" style={{ background: COLOR.card, border: `1.5px dashed ${COLOR.goldSoft}` }}>
          {loading ? (
            <div className="flex flex-col items-center gap-2"><Spinner size={28} /><div className="text-[12px]" style={{ color: COLOR.muted }}>Ama is looking…</div></div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={28} color={COLOR.gold} />
              <div className="text-[13px]" style={{ color: COLOR.muted }}>{analysis ? "Replace pond photo" : "Tap to upload pond photo"}</div>
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />

        {analysis && <AmaBubble>{analysis}</AmaBubble>}
        {err && <div className="text-[12px]" style={{ color: COLOR.danger }}>{err}</div>}

        <Btn onClick={() => onNext(analysis ?? undefined)} disabled={!analysis}>Next</Btn>
        {!analysis && <div className="text-center text-[11px]" style={{ color: COLOR.muted }}>Please upload a pond photo to continue</div>}
      </div>
    </Shell>
  );
}

// ---------- Onboarding 2: Location ----------
export function Onboarding2({ onNext }: { onNext: () => void }) {
  const [farm, setFarm] = useState<Farm>(() => Store.getFarm());
  const [status, setStatus] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [latStr, setLatStr] = useState(""); const [lonStr, setLonStr] = useState("");
  useEffect(() => { Store.setFarm(farm); }, [farm]);

  function share() {
    if (!navigator.geolocation) { setStatus("Geolocation unavailable"); return; }
    setStatus("Requesting…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setFarm({ ...farm, lat: p.coords.latitude, lon: p.coords.longitude }); setStatus("Location saved"); },
      () => setStatus("Permission denied. Enter manually below."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  function saveManual() {
    const la = Number(latStr), lo = Number(lonStr);
    if (Number.isFinite(la) && Number.isFinite(lo)) { setFarm({ ...farm, lat: la, lon: lo }); setStatus("Saved"); }
  }

  return (
    <Shell>
      <Progress step={2} total={3} />
      <div className="px-6 pt-5 pb-8 space-y-5">
        <AmaBubble>Now I need your location to track weather for your farm and send you alerts.</AmaBubble>

        <button onClick={share} className="w-full rounded-xl px-4 h-14 flex items-center justify-between" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
          <div className="flex items-center gap-3">
            <MapPin size={20} color={farm.lat ? COLOR.gold : COLOR.muted} />
            <div className="text-left">
              <div className="text-[14px] font-semibold" style={{ color: COLOR.text }}>{farm.lat ? "Location saved" : "Share My Location"}</div>
              {farm.lat && <div className="text-[11px]" style={{ color: COLOR.muted }}>{farm.lat.toFixed(4)}, {farm.lon?.toFixed(4)}</div>}
            </div>
          </div>
          <ChevronRight size={18} color={COLOR.muted} />
        </button>

        <button onClick={() => setManual((v) => !v)} className="w-full text-left text-[13px]" style={{ color: COLOR.muted }}>Enter Location Manually</button>
        {manual && (
          <div className="space-y-3">
            <Field label="Latitude"><input value={latStr} onChange={(e) => setLatStr(e.target.value)} placeholder="5.6037" className="w-full bg-transparent outline-none" style={{ color: COLOR.text }} /></Field>
            <Field label="Longitude"><input value={lonStr} onChange={(e) => setLonStr(e.target.value)} placeholder="-0.1870" className="w-full bg-transparent outline-none" style={{ color: COLOR.text }} /></Field>
            <Btn onClick={saveManual}>Save</Btn>
          </div>
        )}
        {status && <div className="text-[12px]" style={{ color: COLOR.muted }}>{status}</div>}

        <Btn onClick={onNext} disabled={!farm.lat || !farm.lon}>Next</Btn>
        {(!farm.lat || !farm.lon) && <div className="text-center text-[11px]" style={{ color: COLOR.muted }}>Please share or enter your location to continue</div>}
      </div>
    </Shell>
  );
}

// ---------- Onboarding 3: Farm details ----------
export function Onboarding3({ onDone }: { onDone: () => void }) {
  const [farm, setFarm] = useState<Farm>(() => Store.getFarm());
  function set<K extends keyof Farm>(k: K, v: Farm[K]) { setFarm((f) => ({ ...f, [k]: v })); }
  useEffect(() => { Store.setFarm(farm); }, [farm]);

  return (
    <Shell>
      <Progress step={3} total={3} />
      <div className="px-6 pt-5 pb-10 space-y-4">
        <AmaBubble>Almost done. Tell me about your fish.</AmaBubble>

        <Card>
          <Eyebrow gold>Number of fish</Eyebrow>
          <div className="mt-3 flex items-center justify-between">
            <button onClick={() => set("fishCount", Math.max(0, farm.fishCount - 50))} className="h-10 w-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${COLOR.div}` }}><Minus size={16} color={COLOR.text} /></button>
            <input value={farm.fishCount} onChange={(e) => set("fishCount", Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} inputMode="numeric" className="bg-transparent text-[36px] font-bold text-center outline-none w-32" style={{ color: COLOR.text }} />
            <button onClick={() => set("fishCount", farm.fishCount + 50)} className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: COLOR.gold }}><Plus size={16} color={COLOR.bg} /></button>
          </div>
        </Card>

        <Card>
          <Eyebrow gold>Fish type</Eyebrow>
          <input
            list="fish-suggestions"
            value={farm.fishType}
            onChange={(e) => set("fishType", e.target.value)}
            placeholder="Search or type (e.g. Tilapia, Catfish, Heterotis)"
            className="mt-3 w-full rounded-xl px-3 h-11 bg-transparent outline-none text-[14px]"
            style={{ background: COLOR.card2, color: COLOR.text, border: `1px solid ${COLOR.div}` }}
          />
          <datalist id="fish-suggestions">
            {["Tilapia","Catfish","Heterotis","Mudfish","Carp","Snakehead","African Bonytongue","Electric Catfish","Trout","Goldfish"].map((s) => <option key={s} value={s} />)}
          </datalist>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Tilapia","Catfish","Heterotis","Carp"].map((s) => (
              <button key={s} type="button" onClick={() => set("fishType", s)} className="rounded-full px-2.5 py-1 text-[11px]" style={{ border: `1px solid ${farm.fishType === s ? COLOR.gold : COLOR.div}`, color: farm.fishType === s ? COLOR.gold : COLOR.muted }}>{s}</button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <Eyebrow gold>Do you have any other fish? (optional)</Eyebrow>
            {(farm.extraFish?.length ?? 0) < 2 && (
              <button type="button" onClick={() => set("extraFish", [...(farm.extraFish ?? []), { type: "", count: 0 }])} className="text-[11px]" style={{ color: COLOR.gold }}>+ Add</button>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {(farm.extraFish ?? []).map((ef, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  list="fish-suggestions"
                  value={ef.type}
                  onChange={(e) => {
                    const next = [...(farm.extraFish ?? [])]; next[i] = { ...next[i], type: e.target.value }; set("extraFish", next);
                  }}
                  placeholder="Type"
                  className="flex-1 rounded-lg px-2 h-10 bg-transparent outline-none text-[13px]"
                  style={{ background: COLOR.card2, color: COLOR.text, border: `1px solid ${COLOR.div}` }}
                />
                <input
                  inputMode="numeric"
                  value={ef.count || ""}
                  onChange={(e) => {
                    const next = [...(farm.extraFish ?? [])]; next[i] = { ...next[i], count: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }; set("extraFish", next);
                  }}
                  placeholder="How many"
                  className="w-24 rounded-lg px-2 h-10 bg-transparent outline-none text-[13px] text-center"
                  style={{ background: COLOR.card2, color: COLOR.text, border: `1px solid ${COLOR.div}` }}
                />
                <button type="button" onClick={() => { const next = (farm.extraFish ?? []).filter((_, j) => j !== i); set("extraFish", next); }} className="p-1.5"><X size={16} color={COLOR.muted} /></button>
              </div>
            ))}
            {(farm.extraFish?.length ?? 0) === 0 && (
              <div className="text-[12px]" style={{ color: COLOR.muted }}>You can add up to 2 other fish types.</div>
            )}
          </div>
        </Card>

        <Card>
          <Eyebrow gold>Fish size</Eyebrow>
          <div className="mt-3 flex gap-2">
            {(["Fingerling", "Medium", "Almost Harvest"] as const).map((s) => {
              const a = farm.fishSize === s;
              return (
                <button key={s} onClick={() => set("fishSize", s)} className="flex-1 h-10 rounded-full text-[12px]" style={{ border: `1px solid ${a ? COLOR.gold : COLOR.div}`, color: a ? COLOR.gold : COLOR.nav }}>
                  {s}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <Eyebrow gold>Stocking date</Eyebrow>
          <input type="date" required value={farm.stockDate} onChange={(e) => set("stockDate", e.target.value)} className="mt-2 w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text, colorScheme: "dark" }} />
        </Card>

        {(() => {
          const extraOk = (farm.extraFish ?? []).every((e) => e.type.trim() && e.count > 0);
          const disabled = !farm.fishType.trim() || !farm.fishSize || farm.fishCount <= 0 || !farm.stockDate || !extraOk;
          return (
            <>
              <Btn onClick={onDone} disabled={disabled}>Finish Setup</Btn>
              {disabled && <div className="text-center text-[11px]" style={{ color: COLOR.muted }}>All fields are required. Optional extra fish need both type and count.</div>}
            </>
          );
        })()}
      </div>
    </Shell>
  );
}

// ---------- Header used in main screens ----------
function MainHeader({ user, onGoNotif, onGoProfile, notifCount }: { user: User; onGoNotif: () => void; onGoProfile: () => void; notifCount: number }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-2">
      <div className="flex items-center gap-2.5">
        <Logo size={32} />
        <div>
          <div className="text-[13px] font-bold tracking-[0.14em]" style={{ color: COLOR.text }}>FISHFARM OS</div>
          <div className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: COLOR.gold }}>GHANA</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onGoNotif} className="relative p-1" aria-label="Notifications">
          <Bell size={22} color={COLOR.text} strokeWidth={1.75} />
          {notifCount > 0 && <span className="absolute top-0 right-0 h-2 w-2 rounded-full" style={{ background: COLOR.danger }} />}
        </button>
        <button onClick={onGoProfile} className="h-10 w-10 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ background: COLOR.card, border: `1.5px solid ${COLOR.gold}`, color: COLOR.text }}>
          {initials(user.name) || "F"}
        </button>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
export function Dashboard({
  user, farm, notifs, onGo, weather, briefing, profitEstimate, onListen, refreshingBriefing,
}: {
  user: User; farm: Farm; notifs: Notif[]; onGo: (s: Screen) => void;
  weather: WeatherSnapshot | null; briefing: string | null; profitEstimate: number;
  onListen: () => void; refreshingBriefing: boolean;
}) {
  const hr = new Date().getHours();
  const greet = greetingForHour(hr);
  const WeatherIcon = !weather ? Cloud : weather.current.icon === "rain" ? CloudRain : weather.current.icon === "cloud" ? Cloud : Sun;
  return (
    <>
      <MainHeader user={user} onGoNotif={() => onGo("notifications")} onGoProfile={() => onGo("profile")} notifCount={notifs.filter((n) => !n.read).length} />
      <div className="px-5 pb-6 space-y-5">
        <div>
          <div className="text-[22px] font-light" style={{ color: COLOR.text }}>{greet},</div>
          <div className="text-[40px] font-bold leading-[1.05]" style={{ color: COLOR.text }}>{firstName(user.name)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-[12px]" style={{ color: COLOR.muted }}>
            <MapPin size={12} color={COLOR.muted} /> {user.farmName} · {user.region}
          </div>
        </div>

        <Card accent>
          <div className="flex items-center justify-between">
            <Eyebrow gold>AI Briefing</Eyebrow>
            <div className="h-6 w-6 rounded-full flex items-center justify-center" style={{ border: `1px solid ${COLOR.goldSoft}` }}>
              <Fish size={12} color={COLOR.gold} />
            </div>
          </div>
          <div className="mt-3 text-[15px] leading-relaxed min-h-[60px]" style={{ color: COLOR.text }}>
            {refreshingBriefing ? <Spinner /> : briefing || "Tap refresh to get today's briefing."}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button onClick={onListen} className="inline-flex items-center gap-2 text-[13px]" style={{ color: COLOR.gold }}>
              <Volume2 size={14} /> Listen
            </button>
            <div className="text-[10px]" style={{ color: COLOR.muted }}>{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
          </div>
        </Card>

        <div>
          <div className="text-[16px] font-bold mb-2" style={{ color: COLOR.text }}>At a Glance</div>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat Icon={Layers} label="Pond" value={String(farm.pondCount || 1)} sub="Active Ponds" />
            <Stat Icon={Fish} label="Stock" value={farm.fishCount.toLocaleString()} sub={`${farm.fishType || "Fish"}`} />
            <Stat Icon={TrendingUp} label="Profit (MTD)" value={fmtGHS(profitEstimate)} sub="+12% vs last month" goldValue />
          </div>
        </div>

        <div>
          <div className="text-[16px] font-bold mb-2" style={{ color: COLOR.text }}>Quick Actions</div>
          <div className="grid grid-cols-2 gap-2.5">
            <Quick Icon={Calculator} title="Feed Calculator" sub="Calculate optimal feed" onClick={() => onGo("feed-calc")} />
            <Quick Icon={Stethoscope} title="Fish Doctor" sub="Check fish health" onClick={() => onGo("fish-doctor")} />
            <Quick Icon={Bell} title="Pond Alerts" sub="View all alerts" onClick={() => onGo("weather")} />
            <Quick Icon={BarChart2} title="Market Prices" sub="Check fish prices" onClick={() => onGo("market")} />
            <Quick Icon={ShoppingBag} title="Buy Supplies" sub="Find quality supplies" onClick={() => onGo("market")} />
            <Quick Icon={Tag} title="Sell Fish" sub="List your fish" onClick={() => onGo("sell")} />
          </div>
        </div>

        <button onClick={() => onGo("weather")} className="w-full rounded-xl p-4 flex items-center gap-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
          <WeatherIcon size={32} color={COLOR.warn} />
          <div className="flex-1 text-left">
            <div className="text-[14px] font-bold" style={{ color: COLOR.text }}>{weather ? weather.current.condition : "Weather Update"}</div>
            <div className="text-[12px]" style={{ color: COLOR.muted }}>{weather ? `${weather.current.temp}°C · wind ${weather.current.wind} km/h` : "Tap to load forecast"}</div>
          </div>
          <span className="rounded-lg px-3 py-1.5 text-[11px]" style={{ border: `1px solid ${COLOR.goldSoft}`, color: COLOR.gold }}>View Details</span>
        </button>
      </div>
    </>
  );
}

function Stat({ Icon, label, value, sub, goldValue }: { Icon: typeof Fish; label: string; value: string; sub: string; goldValue?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
      <Icon size={16} color={COLOR.gold} />
      <div className="mt-2"><Eyebrow>{label}</Eyebrow></div>
      <div className="mt-1 text-[18px] font-bold leading-tight" style={{ color: goldValue ? COLOR.gold : COLOR.text }}>{value}</div>
      <div className="text-[10px]" style={{ color: COLOR.muted }}>{sub}</div>
    </div>
  );
}

function Quick({ Icon, title, sub, onClick }: { Icon: typeof Fish; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl p-4 text-left flex flex-col gap-2" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
      <div className="flex items-center justify-between">
        <Icon size={22} color={COLOR.gold} />
        <ChevronRight size={16} color={COLOR.nav} />
      </div>
      <div>
        <div className="text-[14px] font-semibold" style={{ color: COLOR.text }}>{title}</div>
        <div className="text-[11px]" style={{ color: COLOR.muted }}>{sub}</div>
      </div>
    </button>
  );
}

// ---------- Chat ----------
export function Chat({ user, farm, onBack }: { user: User; farm: Farm; onBack: () => void }) {
  const ask = useServerFn(askAma);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const h = Store.getChat();
    if (h.length) return h;
    return [{ id: "1", role: "assistant", ts: Date.now(), content: `Hi ${firstName(user.name)}, I'm Ama. How can I help with your fish today?` }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceCall, setVoiceCall] = useState(false);
  const recRef = useRef<{ stop: () => Promise<string> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { Store.setChat(messages); }, [messages]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  async function send(text: string, image?: string) {
    const trimmed = text.trim();
    if (!trimmed && !image) return;
    const userMsg: ChatMessage = { id: String(Date.now()), role: "user", content: trimmed || "(image)", image, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next); setInput(""); setLoading(true);
    try {
      const context = `pondCount=${farm.pondCount} fishCount=${farm.fishCount} fishType=${farm.fishType} fishSize=${farm.fishSize} farm=${user.farmName} region=${user.region}`;
      const { reply } = await ask({
        data: {
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          language: user.language,
          farmContext: context,
        },
      });
      setMessages((m) => [...m, { id: String(Date.now() + 1), role: "assistant", content: reply || "…", ts: Date.now() }]);
      if (user.language === "Twi") speak(reply);
    } catch {
      setMessages((m) => [...m, { id: String(Date.now() + 2), role: "assistant", content: "Ama is resting, please try again.", ts: Date.now() }]);
    } finally { setLoading(false); }
  }

  async function startRec() {
    try { recRef.current = await recordAndTranscribe(); setRecording(true); } catch { /* permission */ }
  }
  async function stopRec() {
    if (!recRef.current) return;
    try { const text = await recRef.current.stop(); if (text) setInput((v) => (v ? v + " " : "") + text); } catch {}
    setRecording(false); recRef.current = null;
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    send("Please analyse this", dataUrl);
  }

  function onVoiceTurn(userText: string, amaText: string) {
    setMessages((m) => [
      ...m,
      { id: String(Date.now()), role: "user", content: userText, ts: Date.now() },
      { id: String(Date.now() + 1), role: "assistant", content: amaText, ts: Date.now() + 1 },
    ]);
  }

  const suggestions = ["Water quality tips", "Signs of disease", "Market prices", "Weather update"];

  return (
    <div className="flex h-screen flex-col" style={{ background: COLOR.bg }}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${COLOR.div}` }}>
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={COLOR.text} /></button>
        <div className="text-center">
          <div className="text-[16px] font-bold" style={{ color: COLOR.text }}>Ama</div>
          <div className="text-[11px]" style={{ color: COLOR.muted }}>AI Fish Expert</div>
        </div>
        <button
          onClick={() => setVoiceCall(true)}
          aria-label="Start voice call"
          className="h-9 w-9 rounded-full flex items-center justify-center"
          style={{ background: COLOR.card, border: `1px solid ${COLOR.gold}` }}
        >
          <Phone size={16} color={COLOR.gold} />
        </button>
      </div>


      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4 no-scrollbar">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex gap-2"}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center" style={{ border: `1px solid ${COLOR.gold}` }}>
                <Fish size={14} color={COLOR.gold} />
              </div>
            )}
            <div className="max-w-[78%]">
              {m.role === "assistant" && <div className="mb-1"><Eyebrow gold>AMA</Eyebrow></div>}
              <div
                className="rounded-2xl px-4 py-2.5 text-[14.5px] leading-snug whitespace-pre-wrap"
                style={{
                  background: m.role === "user" ? COLOR.card2 : COLOR.card,
                  border: `1px solid ${m.role === "user" ? COLOR.goldSoft : COLOR.div}`,
                  color: COLOR.text,
                  borderTopRightRadius: m.role === "user" ? 6 : undefined,
                  borderTopLeftRadius: m.role === "assistant" ? 6 : undefined,
                }}
              >
                {m.image && <img src={m.image} alt="" className="mb-2 rounded-lg max-h-48 object-cover" />}
                {m.content}
              </div>
              <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-right" : ""}`} style={{ color: COLOR.muted }}>
                {new Date(m.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${COLOR.gold}` }}><Fish size={14} color={COLOR.gold} /></div>
            <div className="rounded-2xl px-4 py-3 flex gap-1.5" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
              <span className="ama-dot h-1.5 w-1.5 rounded-full" style={{ background: COLOR.gold }} />
              <span className="ama-dot h-1.5 w-1.5 rounded-full" style={{ background: COLOR.gold, animationDelay: "0.2s" }} />
              <span className="ama-dot h-1.5 w-1.5 rounded-full" style={{ background: COLOR.gold, animationDelay: "0.4s" }} />
            </div>
          </div>
        )}

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full px-3 py-1.5 text-[12px]" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}`, color: COLOR.text }}>{s}</button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="px-3 pt-2 pb-5"
        style={{ background: COLOR.bg, borderTop: `1px solid ${COLOR.div}` }}
      >
        <div className="flex items-center gap-2 rounded-full px-3 py-2" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); startRec(); }}
            onPointerUp={(e) => { e.preventDefault(); stopRec(); }}
            onPointerLeave={() => { if (recording) stopRec(); }}
            aria-label="Hold to talk"
            className="p-1"
          >
            <Mic size={20} color={recording ? COLOR.danger : COLOR.gold} />
          </button>
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={recording ? "Listening…" : "Type or speak to Ama..."}
            className="flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: COLOR.text }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="p-1" aria-label="Attach image">
            <ImageIcon size={20} color={COLOR.muted} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          <button type="submit" disabled={loading || !input.trim()} aria-label="Send" className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-50" style={{ background: COLOR.gold }}>
            <Send size={16} color={COLOR.bg} />
          </button>
        </div>
      </form>
      {voiceCall && (
        <VoiceCall user={user} farm={farm} onTurn={onVoiceTurn} onClose={() => setVoiceCall(false)} />
      )}
    </div>
  );
}

// ---------- Voice Call (real-time speech to speech) ----------
function VoiceCall({
  user, farm, onTurn, onClose,
}: { user: User; farm: Farm; onTurn: (u: string, a: string) => void; onClose: () => void }) {
  const ask = useServerFn(askAma);
  const [status, setStatus] = useState<"connecting" | "listening" | "thinking" | "speaking">("connecting");
  const [level, setLevel] = useState(0);
  const [lastUser, setLastUser] = useState("");
  const [lastAma, setLastAma] = useState("");
  const [muted, setMuted] = useState(false);
  const activeRef = useRef(true);
  const mutedRef = useRef(false);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    activeRef.current = true;
    historyRef.current = [];
    void loop();
    return () => {
      activeRef.current = false;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loop() {
    while (activeRef.current) {
      try {
        setStatus("listening");
        const text = await listenUntilSilence(activeRef, mutedRef, (l) => setLevel(l));
        if (!activeRef.current) return;
        if (!text || text.trim().length < 2) continue;
        setLastUser(text);
        setStatus("thinking");
        historyRef.current.push({ role: "user", content: text });
        const context = `pondCount=${farm.pondCount} fishCount=${farm.fishCount} fishType=${farm.fishType} fishSize=${farm.fishSize} farm=${user.farmName} region=${user.region}`;
        const { reply } = await ask({
          data: { messages: historyRef.current.slice(-12), language: user.language, farmContext: context },
        });
        if (!activeRef.current) return;
        const clean = (reply || "").trim() || "I didn't catch that, please repeat.";
        historyRef.current.push({ role: "assistant", content: clean });
        setLastAma(clean);
        onTurn(text, clean);
        setStatus("speaking");
        await speakAsync(clean, user.language === "Twi");
      } catch {
        if (!activeRef.current) return;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  function end() {
    activeRef.current = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    onClose();
  }

  const ring = Math.min(1, level * 6);
  const statusLabel =
    status === "connecting" ? "Connecting…" :
    status === "listening" ? (muted ? "Muted" : "Listening…") :
    status === "thinking" ? "Ama is thinking…" : "Ama is speaking…";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between px-6 py-10" style={{ background: "rgba(15,15,18,0.98)" }}>
      <div className="w-full flex items-center justify-between">
        <div className="text-[12px] uppercase tracking-[0.18em]" style={{ color: COLOR.muted }}>Live with Ama</div>
        <button onClick={end} aria-label="Close" className="p-1"><X size={22} color={COLOR.muted} /></button>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center">
          <span
            className="absolute rounded-full"
            style={{
              width: 220 + ring * 60, height: 220 + ring * 60,
              background: "transparent",
              border: `1px solid ${COLOR.goldSoft}`,
              opacity: 0.5,
              transition: "all 80ms linear",
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              width: 170 + ring * 40, height: 170 + ring * 40,
              background: COLOR.card,
              border: `1px solid ${COLOR.gold}`,
              transition: "all 80ms linear",
            }}
          />
          <div className="relative h-32 w-32 rounded-full flex items-center justify-center" style={{ background: COLOR.card2, border: `2px solid ${COLOR.gold}` }}>
            {status === "thinking" ? (
              <Loader2 size={36} color={COLOR.gold} className="animate-spin" />
            ) : status === "speaking" ? (
              <Volume2 size={36} color={COLOR.gold} />
            ) : (
              <Radio size={36} color={COLOR.gold} />
            )}
          </div>
        </div>

        <div className="text-center">
          <div className="text-[18px] font-semibold" style={{ color: COLOR.text }}>Ama</div>
          <div className="text-[13px] mt-1" style={{ color: COLOR.gold }}>{statusLabel}</div>
        </div>

        <div className="max-w-sm w-full space-y-2 min-h-[80px]">
          {lastUser && (
            <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}`, color: COLOR.muted }}>
              <span style={{ color: COLOR.gold }}>You: </span>{lastUser}
            </div>
          )}
          {lastAma && (
            <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: COLOR.card2, border: `1px solid ${COLOR.goldSoft}`, color: COLOR.text }}>
              <span style={{ color: COLOR.gold }}>Ama: </span>{lastAma}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="h-14 w-14 rounded-full flex items-center justify-center"
          style={{ background: muted ? COLOR.card2 : COLOR.card, border: `1px solid ${muted ? COLOR.danger : COLOR.div}` }}
        >
          <Mic size={22} color={muted ? COLOR.danger : COLOR.text} />
        </button>
        <button
          onClick={end}
          aria-label="End call"
          className="h-16 w-16 rounded-full flex items-center justify-center"
          style={{ background: COLOR.danger }}
        >
          <PhoneOff size={26} color={COLOR.text} />
        </button>
      </div>
    </div>
  );
}

async function listenUntilSilence(
  activeRef: React.MutableRefObject<boolean>,
  mutedRef: React.MutableRefObject<boolean>,
  onLevel: (l: number) => void,
): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  rec.start();

  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  const THRESHOLD = 0.035;
  const SILENCE_MS = 1200;
  const MAX_MS = 15000;
  const MAX_NO_SPEECH_MS = 7000;

  let speaking = false;
  let silentFor = 0;
  const start = Date.now();

  await new Promise<void>((resolve) => {
    function tick() {
      if (!activeRef.current) { resolve(); return; }
      if (mutedRef.current) { onLevel(0); setTimeout(tick, 80); return; }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      onLevel(rms);
      if (rms > THRESHOLD) { speaking = true; silentFor = 0; }
      else if (speaking) { silentFor += 80; }
      const elapsed = Date.now() - start;
      if (speaking && silentFor >= SILENCE_MS) { resolve(); return; }
      if (elapsed >= MAX_MS) { resolve(); return; }
      if (!speaking && elapsed >= MAX_NO_SPEECH_MS) { resolve(); return; }
      setTimeout(tick, 80);
    }
    tick();
  });

  const blob: Blob = await new Promise((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    try { rec.stop(); } catch { resolve(new Blob(chunks, { type: mime })); }
  });
  stream.getTracks().forEach((t) => t.stop());
  try { await ctx.close(); } catch {}

  if (!speaking || blob.size < 1200) return "";

  const ext = mime.includes("webm") ? "webm" : "mp4";
  const fd = new FormData();
  fd.append("file", blob, `voice.${ext}`);
  const res = await fetch("/api/public/transcribe", { method: "POST", body: fd });
  if (!res.ok) return "";
  const j = (await res.json()) as { text?: string };
  return (j.text || "").trim();
}

function speakAsync(text: string, _twi: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GH";
    u.rate = 0.95;
    u.pitch = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}


// ---------- Feed Calculator ----------
export function FeedCalc({ farm: initialFarm, onBack }: { farm: Farm; onBack: () => void }) {
  const [farm, setFarm] = useState(initialFarm);
  useEffect(() => { Store.setFarm(farm); }, [farm]);

  const cfg = { Fingerling: { rate: 0.03, w: 0.010, days: 120 }, Medium: { rate: 0.025, w: 0.200, days: 60 }, "Almost Harvest": { rate: 0.02, w: 0.450, days: 14 } } as const;
  const c = cfg[(farm.fishSize || "Medium") as keyof typeof cfg];
  const totalKgFeed = farm.fishCount * c.w * c.rate;
  const bags = Math.max(1, Math.ceil((totalKgFeed * 1000) / 25000));
  const stock = farm.stockDate ? new Date(farm.stockDate) : null;
  const daysToHarvest = stock ? Math.max(0, c.days - daysBetween(stock, new Date())) : c.days;
  const estProfit = farm.fishCount * c.w * 35; // GHS/kg avg

  const lastLog = Store.getFeed().slice(-1)[0];

  function logFeeding() {
    const next: FeedLog = { date: new Date().toISOString(), bags };
    Store.setFeed([...Store.getFeed(), next]);
    alert(`Logged ${bags} bags for ${fmtDate(new Date())}`);
  }

  return (
    <Shell>
      <TopBar onBack={onBack} title="Feed Calculator" />
      <div className="px-5 pb-8 space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold" style={{ color: COLOR.text }}>{farm.fishCount.toLocaleString()} {farm.fishType || "Fish"} · {farm.fishSize || "Medium"}</div>
              {lastLog && <div className="text-[11px]" style={{ color: COLOR.muted }}>Last fed: {fmtDate(new Date(lastLog.date))}</div>}
            </div>
          </div>
        </Card>

        <Card>
          <Eyebrow gold>Number of fish</Eyebrow>
          <div className="mt-2 flex items-center justify-between">
            <button onClick={() => setFarm({ ...farm, fishCount: Math.max(0, farm.fishCount - 50) })} className="h-9 w-9 rounded-full flex items-center justify-center" style={{ border: `1px solid ${COLOR.div}` }}><Minus size={14} color={COLOR.text} /></button>
            <input value={farm.fishCount} onChange={(e) => setFarm({ ...farm, fishCount: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} className="bg-transparent text-[22px] font-bold text-center outline-none w-28" style={{ color: COLOR.text }} />
            <button onClick={() => setFarm({ ...farm, fishCount: farm.fishCount + 50 })} className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: COLOR.gold }}><Plus size={14} color={COLOR.bg} /></button>
          </div>
        </Card>
        <Card>
          <Eyebrow gold>Fish size</Eyebrow>
          <div className="mt-3 flex gap-2">
            {(["Fingerling", "Medium", "Almost Harvest"] as const).map((s) => {
              const a = farm.fishSize === s;
              return <button key={s} onClick={() => setFarm({ ...farm, fishSize: s })} className="flex-1 h-9 rounded-full text-[12px]" style={{ border: `1px solid ${a ? COLOR.gold : COLOR.div}`, color: a ? COLOR.gold : COLOR.nav }}>{s}</button>;
            })}
          </div>
        </Card>

        <Card accent>
          <Eyebrow gold>Today's feeding</Eyebrow>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-[48px] font-bold leading-none" style={{ color: COLOR.text }}>{bags}</div>
            <div className="text-[14px]" style={{ color: COLOR.muted }}>bags · {(totalKgFeed).toFixed(1)} kg</div>
          </div>
          <div className="mt-2 text-[12px]" style={{ color: COLOR.muted }}>Best window: 7AM — 9AM</div>
        </Card>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat Icon={TrendingUp} label="Growth" value={`${(c.rate * 100).toFixed(1)}%`} sub="per day" />
          <Stat Icon={Calculator} label="Harvest in" value={`${daysToHarvest}d`} sub="days" />
          <Stat Icon={Tag} label="Est. profit" value={fmtGHS(estProfit)} sub="cycle" goldValue />
        </div>

        <Btn variant="solid" onClick={logFeeding}>Log Today's Feeding</Btn>
      </div>
    </Shell>
  );
}

// ---------- Fish Doctor ----------
export function FishDoctor({ onBack }: { onBack: () => void }) {
  const diag = useServerFn(analyzeFishImage);
  const ask = useServerFn(askAma);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<{ stop: () => Promise<string> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    setLoading(true); setText(null);
    try { const { diagnosis } = await diag({ data: { imageBase64: dataUrl } }); setText(diagnosis); }
    catch { setText("Ama is resting, please try again."); }
    finally { setLoading(false); }
  }

  async function recStart() { try { recRef.current = await recordAndTranscribe(); setRecording(true); } catch {} }
  async function recStop() {
    if (!recRef.current) return;
    setRecording(false);
    try {
      const t = await recRef.current.stop();
      if (t) {
        setLoading(true);
        const { reply } = await ask({ data: { messages: [{ role: "user", content: `Symptoms described: ${t}. Identify likely disease, 3 visible symptoms, local treatment first then medicine, urgency LOW/MEDIUM/HIGH. Format with labels DISEASE/SYMPTOMS/TREATMENT/URGENCY.` }] } });
        setText(reply);
      }
    } catch {} finally { setLoading(false); recRef.current = null; }
  }

  const parsed = text ? parseDiagnosis(text) : null;

  return (
    <Shell>
      <TopBar onBack={onBack} title="Fish Doctor" />
      <div className="px-5 pb-8 space-y-4">
        <AmaBubble>Upload a photo of your fish or pond. I will diagnose the problem instantly.</AmaBubble>

        <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl py-8 px-4 flex flex-col items-center gap-2" style={{ background: COLOR.card, border: `1.5px dashed ${COLOR.goldSoft}` }}>
          <Camera size={28} color={COLOR.gold} />
          <div className="text-[13px] font-semibold" style={{ color: COLOR.gold }}>Take Photo</div>
          <div className="text-[12px]" style={{ color: COLOR.muted }}>Upload from Gallery</div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />

        <div className="text-center text-[12px]" style={{ color: COLOR.muted }}>or describe symptoms</div>

        <button
          onPointerDown={(e) => { e.preventDefault(); recStart(); }}
          onPointerUp={(e) => { e.preventDefault(); recStop(); }}
          onPointerLeave={() => { if (recording) recStop(); }}
          className="w-full rounded-xl p-4 flex items-center gap-3"
          style={{ background: COLOR.card, border: `1px solid ${recording ? COLOR.danger : COLOR.div}` }}
        >
          <Mic size={20} color={recording ? COLOR.danger : COLOR.gold} />
          <div className="text-[13px]" style={{ color: COLOR.muted }}>{recording ? "Listening… release to stop" : "Hold to describe what you see"}</div>
        </button>

        {loading && <div className="flex justify-center"><Spinner /></div>}

        {parsed && (
          <Card accent>
            <Eyebrow gold>Diagnosis Result</Eyebrow>
            <div className="mt-2 text-[20px] font-bold" style={{ color: COLOR.text }}>{parsed.disease || "Diagnosis"}</div>
            <div className="mt-2"><UrgencyBadge level={parsed.urgency} /></div>
            <div className="my-3 h-px" style={{ background: COLOR.div }} />
            {parsed.symptoms && <Section label="Symptoms detected" body={parsed.symptoms} />}
            {parsed.treatment && <Section label="Recommended treatment" body={parsed.treatment} />}
            {parsed.feeding && <Section label="Feeding adjustment" body={parsed.feeding} />}
            <div className="mt-4"><Btn>Find Nearby Supplier</Btn></div>
          </Card>
        )}
      </div>
    </Shell>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div className="mt-3">
      <Eyebrow gold>{label}</Eyebrow>
      <div className="mt-1 text-[14px] whitespace-pre-wrap" style={{ color: COLOR.text }}>{body}</div>
    </div>
  );
}

function UrgencyBadge({ level }: { level: "LOW" | "MEDIUM" | "HIGH" | null }) {
  if (!level) return null;
  const styles = level === "HIGH" ? { bg: "#4A1A1A", fg: "#E05555" } : level === "MEDIUM" ? { bg: "#4A3A1A", fg: COLOR.gold } : { bg: "#2A4A2A", fg: "#6BCB77" };
  return <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: styles.bg, color: styles.fg }}>{level}</span>;
}

function parseDiagnosis(text: string): { disease: string; symptoms: string; treatment: string; feeding: string; urgency: "LOW" | "MEDIUM" | "HIGH" | null } {
  const pick = (k: string) => {
    const re = new RegExp(`${k}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+:|$)`, "i");
    return text.match(re)?.[1]?.trim() ?? "";
  };
  const u = pick("URGENCY").toUpperCase();
  const urgency: "LOW" | "MEDIUM" | "HIGH" | null = u.includes("HIGH") ? "HIGH" : u.includes("MEDIUM") ? "MEDIUM" : u.includes("LOW") ? "LOW" : null;
  return { disease: pick("DISEASE"), symptoms: pick("SYMPTOMS"), treatment: pick("TREATMENT"), feeding: pick("FEEDING"), urgency };
}

// ---------- Weather ----------
export function Weather({ farm, user, onBack }: { farm: Farm; user: User; onBack: () => void }) {
  const [w, setW] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<{ urgency: string; title: string; description: string }[]>([]);
  const genAlerts = useServerFn(generateWeatherAlerts);

  useEffect(() => {
    if (!farm.lat || !farm.lon) return;
    setLoading(true);
    fetchWeather(farm.lat, farm.lon).then(async (ws) => {
      setW(ws);
      try {
        const summary = `Today ${ws.current.temp}C ${ws.current.condition}, max rain prob next 6h ${ws.hourlyPrecipMaxNext6h}%. Forecast: ${ws.forecast.map((f) => `${f.day} ${f.tmin}-${f.tmax}C precip ${f.precip}%`).join("; ")}`;
        const { alerts } = await genAlerts({ data: { weatherSummary: summary } });
        setAlerts(alerts);
      } catch {}
    }).catch(() => {}).finally(() => setLoading(false));
  }, [farm.lat, farm.lon, genAlerts]);

  const Icon = !w ? Cloud : w.current.icon === "rain" ? CloudRain : w.current.icon === "cloud" ? Cloud : Sun;

  return (
    <Shell>
      <TopBar onBack={onBack} title="Weather Alerts" />
      <div className="px-5 pb-8 space-y-4">
        <div className="flex items-center gap-2 text-[12px]"><MapPin size={14} color={COLOR.gold} /><span style={{ color: COLOR.text }}>{user.region}</span><span style={{ color: COLOR.gold }}>· Change</span></div>

        {!farm.lat && <Card><div className="text-[13px]" style={{ color: COLOR.muted }}>Share your location first to load weather.</div></Card>}

        {loading && <div className="flex justify-center py-8"><Spinner size={24} /></div>}

        {w && (
          <>
            <Card>
              <div className="flex items-center justify-between"><Eyebrow gold>Today</Eyebrow>{w.hourlyPrecipMaxNext6h >= 60 && <UrgencyBadge level="HIGH" />}</div>
              <div className="mt-3 flex items-center gap-4">
                <Icon size={56} color={COLOR.warn} />
                <div>
                  <div className="text-[36px] font-bold leading-none" style={{ color: COLOR.text }}>{w.current.temp}°</div>
                  <div className="text-[14px]" style={{ color: COLOR.text }}>{w.current.condition}</div>
                  <div className="text-[11px]" style={{ color: COLOR.muted }}>Wind {w.current.wind} km/h</div>
                </div>
              </div>
              <div className="mt-3 rounded-lg p-3 text-[12px]" style={{ background: COLOR.card2, color: COLOR.text }}>
                {w.hourlyPrecipMaxNext6h >= 60 ? "Heavy rain likely — reduce feeding and check pond inlets." : "Conditions stable — feed at the usual times."}
              </div>
            </Card>

            <div className="grid grid-cols-3 gap-2.5">
              {w.forecast.map((f) => {
                const I = f.icon === "rain" ? CloudRain : f.icon === "cloud" ? Cloud : Sun;
                return (
                  <div key={f.day} className="rounded-xl p-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
                    <Eyebrow>{f.day}</Eyebrow>
                    <I size={22} color={COLOR.warn} className="mt-2" />
                    <div className="mt-1 text-[14px] font-bold" style={{ color: COLOR.text }}>{f.tmax}° / {f.tmin}°</div>
                    <div className="text-[10px]" style={{ color: COLOR.muted }}>{f.precip}% rain</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Eyebrow gold>Active alerts</Eyebrow>
        <div className="space-y-2">
          {alerts.length === 0 && <Card><div className="text-[13px]" style={{ color: COLOR.muted }}>No alerts.</div></Card>}
          {alerts.map((a, i) => {
            const color = a.urgency === "HIGH" ? COLOR.danger : a.urgency === "MEDIUM" ? COLOR.gold : COLOR.div;
            const badge = a.urgency === "HIGH" ? "URGENT" : a.urgency === "MEDIUM" ? "WARNING" : "INFO";
            return (
              <div key={i} className="rounded-xl p-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}`, borderLeft: `3px solid ${color}` }}>
                <div className="text-[10px] font-semibold" style={{ color }}>{badge}</div>
                <div className="text-[14px] font-bold mt-0.5" style={{ color: COLOR.text }}>{a.title}</div>
                <div className="text-[12px]" style={{ color: COLOR.muted }}>{a.description}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

// ---------- Market ----------
export function Market({ user, onBack }: { user: User; onBack: () => void }) {
  const gen = useServerFn(generateMarketPrices);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); gen({ data: {} }).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [gen]);

  const cards: { key: string; label: string }[] = [
    { key: "tilapia_live", label: "Tilapia (Live)" },
    { key: "tilapia_smoked", label: "Tilapia (Smoked)" },
    { key: "catfish_live", label: "Catfish (Live)" },
    { key: "catfish_smoked", label: "Catfish (Smoked)" },
  ];

  return (
    <Shell>
      <TopBar onBack={onBack} title="Market Prices" />
      <div className="px-5 pb-8 space-y-4">
        <div className="text-[12px]" style={{ color: COLOR.muted }}>Updated just now · {user.region}</div>

        {loading && <div className="flex justify-center py-8"><Spinner size={24} /></div>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {cards.map((c) => {
                const d = data[c.key];
                if (!d) return null;
                const cities = ["accra", "kumasi", "tamale"] as const;
                const best = cities.reduce((a, b) => (d[a] >= d[b] ? a : b));
                const TrendIcon = d.trend === "up" ? TrendingUp : d.trend === "down" ? TrendingDown : Minus;
                const color = d.trend === "up" ? COLOR.gold : d.trend === "down" ? COLOR.danger : COLOR.muted;
                return (
                  <div key={c.key} className="rounded-xl p-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
                    <Eyebrow>{c.label}</Eyebrow>
                    <div className="mt-1 text-[24px] font-bold" style={{ color: COLOR.text }}>{fmtGHS(d[best])}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <TrendIcon size={14} color={color} />
                      <span className="text-[11px]" style={{ color }}>{d.trend === "flat" ? "stable" : `${d.change_pct > 0 ? "+" : ""}${d.change_pct}%`} this week</span>
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: COLOR.muted }}>Best in {best[0].toUpperCase() + best.slice(1)}</div>
                  </div>
                );
              })}
            </div>

            {data.insight && (
              <Card accent>
                <Eyebrow gold>AI Insight</Eyebrow>
                <div className="mt-2 text-[14px]" style={{ color: COLOR.text }}>{data.insight}</div>
              </Card>
            )}
          </>
        )}

        <Btn>Notify Me When Prices Change</Btn>
      </div>
    </Shell>
  );
}

// ---------- Sell ----------
export function Sell({ user, farm, onBack }: { user: User; farm: Farm; onBack: () => void }) {
  const gen = useServerFn(generateBuyers);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); gen({ data: {} }).then((r) => setBuyers(r.buyers)).catch(() => {}).finally(() => setLoading(false)); }, [gen]);

  const cfg = farm.fishSize === "Fingerling" ? 120 : farm.fishSize === "Medium" ? 60 : 14;
  const stock = farm.stockDate ? new Date(farm.stockDate) : null;
  const daysReady = stock ? Math.max(0, cfg - daysBetween(stock, new Date())) : cfg;

  return (
    <Shell>
      <TopBar onBack={onBack} title="Sell My Fish" />
      <div className="px-5 pb-8 space-y-4">
        <Card accent>
          <div className="flex items-center justify-between">
            <Eyebrow gold>Your Listing</Eyebrow>
            <span className="text-[12px]" style={{ color: COLOR.gold }}>Edit Listing</span>
          </div>
          <div className="mt-2 text-[15px] font-bold" style={{ color: COLOR.text }}>{farm.fishCount.toLocaleString()} {farm.fishType || "Fish"} · Ready in {daysReady} days</div>
          <div className="text-[12px]" style={{ color: COLOR.muted }}>{user.farmName} · {user.region}</div>
        </Card>

        <Eyebrow gold>Buyer Requests</Eyebrow>
        {loading && <div className="flex justify-center py-6"><Spinner /></div>}
        <div className="space-y-2">
          {buyers.map((b, i) => (
            <Card key={i}>
              <div className="flex items-center justify-between">
                <div className="text-[14px] font-bold" style={{ color: COLOR.text }}>{b.buyer_name}</div>
                {b.urgent && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: COLOR.gold, color: COLOR.bg }}>URGENT</span>}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-[12px]" style={{ color: COLOR.muted }}>{b.quantity_kg}kg {b.fish_type}</div>
                <div className="text-[14px] font-bold" style={{ color: COLOR.gold }}>{fmtGHS(b.price_per_kg)}/kg</div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-[11px]" style={{ color: COLOR.muted }}>{b.location}</div>
                <span className="text-[12px]" style={{ color: COLOR.gold }}>Contact Buyer</span>
              </div>
            </Card>
          ))}
        </div>

        <Btn>List My Fish for Sale</Btn>
      </div>
    </Shell>
  );
}

// ---------- Credit Score ----------
export function CreditScore({ user, farm, onBack }: { user: User; farm: Farm; onBack: () => void }) {
  const profileComplete = Boolean(user.name && user.phone && user.farmName && farm.lat);
  const feedLogs = Store.getFeed();
  const score =
    (profileComplete ? 30 : 15) +
    (farm.pondPhotoAnalysis ? 15 : 0) +
    Math.min(25, feedLogs.length) +
    (farm.stockDate ? 20 : 0) +
    (Store.getChat().length > 2 ? 10 : 0);
  const tier = score <= 40 ? "NEW FARMER" : score <= 70 ? "GROWING FARMER" : "TRUSTED FARMER";
  const daysSinceStock = farm.stockDate ? Math.max(1, daysBetween(new Date(farm.stockDate), new Date())) : 1;
  const consistency = feedLogs.length ? Math.min(100, Math.round((feedLogs.length / daysSinceStock) * 100)) : 0;

  const C = 2 * Math.PI * 56;
  const dash = (score / 100) * C;

  return (
    <Shell>
      <TopBar onBack={onBack} title="Credit Score" />
      <div className="px-5 pb-8 space-y-4">
        <div className="flex flex-col items-center py-4">
          <svg width={140} height={140}>
            <circle cx={70} cy={70} r={56} stroke={COLOR.div} strokeWidth={8} fill="none" />
            <circle cx={70} cy={70} r={56} stroke={COLOR.gold} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${dash} ${C - dash}`} transform="rotate(-90 70 70)" />
            <text x={70} y={78} textAnchor="middle" fontSize="40" fontWeight="700" fill={COLOR.text}>{score}</text>
          </svg>
          <div className="mt-1 text-[12px] font-semibold tracking-[0.18em]" style={{ color: COLOR.gold }}>{tier}</div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat Icon={Calculator} label="Feeding" value={`${consistency}%`} sub="consistency" />
          <Stat Icon={Layers} label="Cycles" value="0" sub="harvests" />
          <Stat Icon={CheckCircle2} label="Profile" value={`${profileComplete ? 100 : 60}%`} sub="complete" />
        </div>

        <Eyebrow gold>Score Breakdown</Eyebrow>
        <Card>
          {[
            ["Pond photo uploaded", Boolean(farm.pondPhotoAnalysis)],
            ["Location verified", Boolean(farm.lat)],
            ["Feeding logs recorded", feedLogs.length > 0],
            ["Stock date set", Boolean(farm.stockDate)],
            ["Profile complete", profileComplete],
          ].map(([label, ok]) => (
            <div key={String(label)} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} color={ok ? COLOR.gold : COLOR.div} />
                <span className="text-[13px]" style={{ color: COLOR.text }}>{label as string}</span>
              </div>
              <span className="text-[12px]" style={{ color: COLOR.muted }}>{ok ? "Earned" : "—"}</span>
            </div>
          ))}
        </Card>

        {score > 40 && (
          <Card accent>
            <Eyebrow gold>Loan Eligible</Eyebrow>
            <div className="mt-2 text-[14px]" style={{ color: COLOR.text }}>
              You qualify for up to {fmtGHS(score * 50)} in feed credit. Repay after harvest.
            </div>
            <div className="mt-3"><Btn>Apply for Loan</Btn></div>
          </Card>
        )}
      </div>
    </Shell>
  );
}

// ---------- Profile / Settings ----------
export function Profile({ user, farm, score, onBack, onLogout, onGo }: { user: User; farm: Farm; score: number; onBack: () => void; onLogout: () => void; onGo: (s: Screen) => void }) {
  const [twi, setTwi] = useState(() => typeof window !== "undefined" && localStorage.getItem("twiVoice") === "true");
  const [briefingOn, setBriefingOn] = useState(() => typeof window !== "undefined" && (localStorage.getItem("ffo.dailyBriefing") ?? "true") === "true");
  const [notifOn, setNotifOn] = useState(() => typeof window !== "undefined" && (localStorage.getItem("ffo.notifEnabled") ?? "true") === "true");
  const [keyOpen, setKeyOpen] = useState(false); const [keyVal, setKeyVal] = useState("");

  useEffect(() => { localStorage.setItem("twiVoice", String(twi)); }, [twi]);
  useEffect(() => { localStorage.setItem("ffo.dailyBriefing", String(briefingOn)); }, [briefingOn]);
  useEffect(() => { localStorage.setItem("ffo.notifEnabled", String(notifOn)); }, [notifOn]);
  useEffect(() => { setKeyVal(localStorage.getItem("khayaApiKey") ?? ""); }, []);

  const tier = score <= 40 ? "NEW FARMER" : score <= 70 ? "GROWING FARMER" : "TRUSTED FARMER";

  return (
    <Shell>
      <TopBar onBack={onBack} title="Profile" />
      <div className="px-5 pb-10 space-y-4">
        <Card>
          <div className="flex flex-col items-center">
            <div className="h-20 w-20 rounded-full flex items-center justify-center text-[24px] font-bold" style={{ background: COLOR.card2, border: `2px solid ${COLOR.gold}`, color: COLOR.text }}>{initials(user.name) || "F"}</div>
            <div className="mt-3 text-[18px] font-bold" style={{ color: COLOR.text }}>{user.name}</div>
            <div className="text-[12px]" style={{ color: COLOR.muted }}>{user.farmName} · {user.region}</div>
            <span className="mt-2 rounded-full px-3 py-1 text-[10px] font-semibold" style={{ background: COLOR.card2, color: COLOR.gold }}>{tier}</span>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat Icon={Fish} label="Fish" value={farm.fishCount.toLocaleString()} sub="in stock" />
          <Stat Icon={Layers} label="Cycles" value="0" sub="completed" />
          <Stat Icon={CheckCircle2} label="Credit" value={String(score)} sub={tier.split(" ")[0]} goldValue />
        </div>

        <div className="space-y-2">
          <Row Icon={LogIn} label="Language" value={user.language} onClick={() => alert("Change language in Settings → Edit profile (coming soon)")} />
          <Toggle Icon={Volume2} label="Twi Voice Mode" value={twi} onChange={setTwi} />
          <Row Icon={SettingsIcon} label="Khaya API Key" value={keyVal ? "•••• set" : "Not set"} onClick={() => setKeyOpen(true)} />
          <Toggle Icon={Bell} label="Daily Briefing" value={briefingOn} onChange={setBriefingOn} />
          <Toggle Icon={Bell} label="Notifications" value={notifOn} onChange={setNotifOn} />
          <Row Icon={MapPin} label="Edit Farm Details" onClick={() => onGo("onboarding-3")} />
          <Row Icon={MessageCircle} label="Help & Support" onClick={() => alert("WhatsApp support: +233 24 000 0000")} />
          <button onClick={() => { if (confirm("Clear all data?")) { Store.clearAll(); onLogout(); } }} className="w-full rounded-xl p-4 flex items-center gap-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
            <Trash2 size={18} color={COLOR.danger} />
            <span className="text-[14px]" style={{ color: COLOR.danger }}>Clear All Data</span>
          </button>
        </div>

        <div className="text-center text-[11px]" style={{ color: COLOR.nav }}>FishFarm OS Ghana v1.0 · Made in Ghana</div>
      </div>

      {keyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setKeyOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-5" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
            <div className="flex items-center justify-between"><div className="text-[15px] font-bold" style={{ color: COLOR.text }}>Khaya AI Key</div><button onClick={() => setKeyOpen(false)}><X size={18} color={COLOR.muted} /></button></div>
            <input value={keyVal} onChange={(e) => setKeyVal(e.target.value)} className="mt-3 w-full rounded-xl px-3 h-11 bg-transparent outline-none" style={{ background: COLOR.card2, color: COLOR.text, border: `1px solid ${COLOR.div}` }} placeholder="Paste your Khaya subscription key" />
            <div className="mt-3"><Btn variant="solid" onClick={() => { localStorage.setItem("khayaApiKey", keyVal); setKeyOpen(false); }}>Save</Btn></div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Row({ Icon, label, value, onClick }: { Icon: typeof Bell; label: string; value?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-xl p-4 flex items-center gap-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
      <Icon size={18} color={COLOR.gold} />
      <div className="flex-1 text-left text-[14px]" style={{ color: COLOR.text }}>{label}</div>
      {value && <div className="text-[12px]" style={{ color: COLOR.muted }}>{value}</div>}
      <ChevronRight size={16} color={COLOR.nav} />
    </button>
  );
}

function Toggle({ Icon, label, value, onChange }: { Icon: typeof Bell; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="w-full rounded-xl p-4 flex items-center gap-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
      <Icon size={18} color={COLOR.gold} />
      <div className="flex-1 text-[14px]" style={{ color: COLOR.text }}>{label}</div>
      <button onClick={() => onChange(!value)} className="h-6 w-11 rounded-full relative transition-colors" style={{ background: value ? COLOR.gold : COLOR.div }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform" style={{ transform: value ? "translateX(22px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}

// ---------- Notifications ----------
export function Notifications({ notifs, onBack, onRead }: { notifs: Notif[]; onBack: () => void; onRead: () => void }) {
  useEffect(() => { onRead(); }, [onRead]);
  return (
    <Shell>
      <TopBar onBack={onBack} title="Alerts" />
      <div className="px-5 pb-8 space-y-2">
        {notifs.length === 0 && <Card><div className="text-[13px]" style={{ color: COLOR.muted }}>You're all caught up.</div></Card>}
        {notifs.slice().reverse().map((n) => (
          <Card key={n.id}>
            <div className="flex items-start gap-3">
              <Bell size={18} color={COLOR.gold} className="mt-0.5" />
              <div className="flex-1">
                <div className="text-[14px] font-bold" style={{ color: COLOR.text }}>{n.title}</div>
                <div className="text-[12px]" style={{ color: COLOR.muted }}>{n.body}</div>
                <div className="mt-1 text-[10px]" style={{ color: COLOR.nav }}>{new Date(n.ts).toLocaleString()}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
