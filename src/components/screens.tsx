import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Bell, MapPin, ChevronRight, Upload, Camera, Mic, Send, Image as ImageIcon,
  Calculator, Stethoscope, BarChart2, ShoppingBag, Tag, Cloud, CloudRain, Sun,
  Volume2, Layers, Fish, TrendingUp, TrendingDown, Minus, Plus, CheckCircle2,
  Trash2, Loader2, X, Settings as SettingsIcon, MessageCircle, Home as HomeIcon,
  LogIn, Phone, PhoneOff, Radio, Store as StoreIcon, PlusCircle, History, SquarePen,
} from "lucide-react";
import {
  Store, type User, type Farm, type ChatMessage, type ChatSession, type FeedLog, type Notif, type FishListing,
  greetingForHour, fmtGHS, fmtDate, initials, firstName, daysBetween,
} from "@/lib/storage";
import { fetchWeather, type WeatherSnapshot } from "@/lib/weather";
import { speak, speakGemini, recordAndTranscribe } from "@/lib/voice";
import {
  askAma, analyzePondImage, analyzeFishImage, generateBriefing,
  generateMarketPrices, generateWeatherAlerts, generateBuyers, SYSTEM_PROMPT,
} from "@/lib/groq.functions";

const COLOR = {
  bg: "#0F0F12", card: "#18181C", card2: "#202027", text: "#F5F5F2",
  muted: "#8A8A92", gold: "#C89B5A", goldSoft: "#9A7448", warn: "#5E636B",
  div: "#2A2A31", nav: "#6B6B73", danger: "#E05555", ok: "#6BCB77",
};

export type Screen =
  | "splash" | "register" | "onboarding-1" | "onboarding-2" | "onboarding-3"
  | "dashboard" | "chat" | "feed-calc" | "pond-journal" | "weather"
  | "market" | "sell" | "credit-score" | "profile" | "notifications" | "marketplace" | "shop";

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
    <img
      src="/logo.png"
      alt="Fish Doctor"
      width={size}
      height={size}
      style={{ borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${COLOR.gold}` }}
    />
  );
}

// ============== Markdown Renderer ==============
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  function inlineFormat(line: string): React.ReactNode {
    // Split on **bold**, *italic*, `code`
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{ color: COLOR.gold, fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i} style={{ color: COLOR.text, fontStyle: "italic" }}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={i} className="rounded px-1 text-[13px]" style={{ background: COLOR.card2, color: COLOR.gold, fontFamily: "monospace" }}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H1 — # heading
    if (/^# (.+)/.test(line)) {
      nodes.push(
        <div key={key++} className="text-[17px] font-bold mt-2 mb-1" style={{ color: COLOR.gold }}>
          {inlineFormat(line.replace(/^# /, ""))}
        </div>
      );
    }
    // H2 — ## heading
    else if (/^## (.+)/.test(line)) {
      nodes.push(
        <div key={key++} className="text-[15px] font-bold mt-2 mb-0.5 uppercase tracking-wide" style={{ color: COLOR.gold }}>
          {inlineFormat(line.replace(/^## /, ""))}
        </div>
      );
    }
    // H3 — ### heading
    else if (/^### (.+)/.test(line)) {
      nodes.push(
        <div key={key++} className="text-[14px] font-semibold mt-1.5 mb-0.5" style={{ color: COLOR.gold }}>
          {inlineFormat(line.replace(/^### /, ""))}
        </div>
      );
    }
    // Bullet — - or *
    else if (/^[\-\*] (.+)/.test(line)) {
      nodes.push(
        <div key={key++} className="flex gap-1.5 pl-1 mt-0.5">
          <span style={{ color: COLOR.gold, flexShrink: 0 }}>•</span>
          <span>{inlineFormat(line.replace(/^[\-\*] /, ""))}</span>
        </div>
      );
    }
    // Numbered list
    else if (/^\d+\. (.+)/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1];
      nodes.push(
        <div key={key++} className="flex gap-1.5 pl-1 mt-0.5">
          <span style={{ color: COLOR.gold, flexShrink: 0 }}>{num}.</span>
          <span>{inlineFormat(line.replace(/^\d+\. /, ""))}</span>
        </div>
      );
    }
    // Divider
    else if (/^---+$/.test(line)) {
      nodes.push(<hr key={key++} className="my-2" style={{ borderColor: COLOR.div }} />);
    }
    // Empty line — small gap
    else if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-1.5" />);
    }
    // Normal paragraph
    else {
      nodes.push(
        <p key={key++} className="leading-relaxed">
          {inlineFormat(line)}
        </p>
      );
    }
  }
  return nodes;
}

// ============== Typewriter component ==============
function Typewriter({ text, speed = 2, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const posRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => {
    posRef.current = 0;
    doneRef.current = false;
    setDisplayed("");

    const tick = () => {
      if (doneRef.current) return;
      posRef.current = Math.min(posRef.current + speed, text.length);
      setDisplayed(text.slice(0, posRef.current));
      if (posRef.current >= text.length) {
        doneRef.current = true;
        onDone?.();
      } else {
        requestAnimationFrame(tick);
      }
    };
    const raf = requestAnimationFrame(tick);
    return () => { doneRef.current = true; cancelAnimationFrame(raf); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return <>{renderMarkdown(displayed)}</>;
}

// ============== Bottom Nav ==============
export function BottomNav({ current, onGo, notifCount }: { current: Screen; onGo: (s: Screen) => void; notifCount: number }) {
  const items: { key: Screen; label: string; Icon: typeof HomeIcon }[] = [
    { key: "dashboard", label: "Home", Icon: HomeIcon },
    { key: "chat", label: "Doctor", Icon: MessageCircle },
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
        <div className="mt-6 text-[24px] font-bold tracking-wider" style={{ color: COLOR.text }}>FISH DOCTOR</div>
        <div className="mt-1 text-[12px] tracking-[0.18em] font-semibold" style={{ color: COLOR.gold }}>GHANA</div>
        <div className="mt-3 text-[13px]" style={{ color: COLOR.muted }}>Your Smart Fish Farming Assistant</div>

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
  const [uploaded, setUploaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setErr(null); setLoading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
      });
      // Silently analyse and save — don't show the result during onboarding
      const { analysis } = await analyze({ data: { imageBase64: dataUrl } });
      const farm = Store.getFarm(); Store.setFarm({ ...farm, pondPhotoAnalysis: analysis });
      setUploaded(true);
    } catch {
      setErr("Could not analyse photo, please try again.");
    } finally { setLoading(false); }
  }

  return (
    <Shell>
      <Progress step={1} total={3} />
      <div className="px-6 pt-5 pb-8 space-y-5">
        <AmaBubble>Hi {firstName(user.name)}! I'm Fish Doctor, your personal farming companion. Let me take a quick look at your pond — upload a photo and I'll have a full report waiting for you once you're set up.</AmaBubble>

        <button onClick={() => fileRef.current?.click()} className="block w-full rounded-xl py-10 px-4 text-center" style={{ background: COLOR.card, border: `1.5px dashed ${uploaded ? COLOR.gold : COLOR.goldSoft}` }}>
          {loading ? (
            <div className="flex flex-col items-center gap-2"><Spinner size={28} /><div className="text-[12px]" style={{ color: COLOR.muted }}>Got it, analysing…</div></div>
          ) : uploaded ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 size={28} color={COLOR.gold} />
              <div className="text-[13px] font-semibold" style={{ color: COLOR.gold }}>Pond photo saved!</div>
              <div className="text-[11px]" style={{ color: COLOR.muted }}>Tap to replace</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={28} color={COLOR.gold} />
              <div className="text-[13px]" style={{ color: COLOR.muted }}>Tap to upload pond photo</div>
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />

        {err && <div className="text-[12px]" style={{ color: COLOR.danger }}>{err}</div>}

        <Btn onClick={() => onNext(Store.getFarm().pondPhotoAnalysis ?? undefined)} disabled={!uploaded && !Store.getFarm().pondPhotoAnalysis}>Next</Btn>
        {!uploaded && !Store.getFarm().pondPhotoAnalysis && (
          <div className="text-center">
            <button onClick={() => onNext(undefined)} className="text-[12px]" style={{ color: COLOR.muted }}>Skip for now</button>
          </div>
        )}
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
          <div className="text-[13px] font-bold tracking-[0.14em]" style={{ color: COLOR.text }}>FISH DOCTOR</div>
          <div className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: COLOR.gold }}>GHANA</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onGoNotif} className="relative p-1" aria-label="Notifications">
          <Bell size={22} color={COLOR.text} strokeWidth={1.75} />
          {notifCount > 0 && <span className="absolute top-0 right-0 h-2 w-2 rounded-full" style={{ background: COLOR.danger }} />}
        </button>
        <button onClick={onGoProfile} className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-[13px] font-bold" style={{ background: COLOR.card, border: `1.5px solid ${COLOR.gold}`, color: COLOR.text }}>
          {user.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : (initials(user.name) || "F")}
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
  const briefingOn = typeof window !== "undefined" ? (localStorage.getItem("ffo.dailyBriefing") ?? "true") === "true" : true;
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

        {briefingOn && (
        <Card accent>
          <div className="flex items-center justify-between">
            <Eyebrow gold>AI Briefing</Eyebrow>
            <div className="h-6 w-6 rounded-full overflow-hidden" style={{ border: `1px solid ${COLOR.goldSoft}` }}>
              <img src="/logo.png" alt="" className="h-full w-full object-cover" />
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
        )}

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
            <Quick Icon={Stethoscope} title="Pond Journal" sub="Log daily pond conditions" onClick={() => onGo("pond-journal")} />
            <Quick Icon={Bell} title="Pond Alerts" sub="View all alerts" onClick={() => onGo("weather")} />
            <Quick Icon={BarChart2} title="Market Prices" sub="Check fish prices" onClick={() => onGo("market")} />
            <Quick Icon={StoreIcon} title="Shop" sub="Fish, feeds & medicine" onClick={() => onGo("shop")} />
            <Quick Icon={Tag} title="Sell Fish" sub="List your fish for sale" onClick={() => onGo("marketplace")} />
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
export function Chat({ user, farm: initialFarm, onBack, onFarmUpdate }: { user: User; farm: Farm; onBack: () => void; onFarmUpdate?: (f: Farm) => void }) {
  const ask = useServerFn(askAma);
  const diag = useServerFn(analyzeFishImage);
  const [farm, setFarm] = useState(initialFarm);
  const [sessionId, setSessionId] = useState<string>(() => String(Date.now()));
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const h = Store.getChat();
    if (h.length) return h;
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    return [{ id: "1", role: "assistant", ts: Date.now(), content: `Hey ${firstName(user.name)}! Good ${timeGreet} 😊 I'm Fish Doctor. How are you and your fish doing today?` }];
  });
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceCall, setVoiceCall] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const recRef = useRef<{ stop: () => Promise<string> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track which message IDs have already been typewriter-animated so re-entering chat doesn't re-animate
  const animatedIds = useRef<Set<string>>(new Set(messages.map((m) => m.id)));

  // Save session whenever messages change
  useEffect(() => {
    Store.setChat(messages);
    if (messages.length > 1) {
      // Use first user message as title, fallback to "Chat"
      const firstUser = messages.find((m) => m.role === "user");
      const title = firstUser ? firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? "…" : "") : "Chat";
      Store.saveSession({ id: sessionId, title, messages, ts: Date.now() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  // Parse [[ACTION:{...}]] blocks from AI reply and apply them
  function applyFarmActions(reply: string, currentFarm: Farm): { clean: string; updated: Farm } {
    let updated = { ...currentFarm };
    let changed = false;
    const clean = reply.replace(/\[\[ACTION:([\s\S]*?)\]\]/g, (_, json) => {
      try {
        const action = JSON.parse(json) as { type: string; data: Partial<Farm> };
        if (action.type === "update_farm" && action.data) {
          updated = { ...updated, ...action.data };
          changed = true;
        }
      } catch {}
      return "";
    }).trim();
    if (changed) {
      Store.setFarm(updated);
      setFarm(updated);
      onFarmUpdate?.(updated);
    }
    return { clean, updated };
  }

  async function send(text: string, image?: string) {
    const trimmed = text.trim();
    if (!trimmed && !image) return;
    const userMsg: ChatMessage = { id: String(Date.now()), role: "user", content: trimmed || (image ? "Please analyse this image" : ""), image, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next); setInput(""); setPendingImage(null); setLoading(true);
    try {
      const context = `pondCount=${farm.pondCount} fishCount=${farm.fishCount} fishType=${farm.fishType} fishSize=${farm.fishSize} farm=${user.farmName} region=${user.region} stockDate=${farm.stockDate}`;
      let reply = "";
      if (image) {
        const { diagnosis } = await diag({ data: { imageBase64: image, userQuestion: trimmed } });
        reply = diagnosis;
        if (trimmed) {
          const r2 = await ask({
            data: {
              messages: [...next.map((m) => ({ role: m.role, content: m.content })), { role: "assistant", content: diagnosis }],
              language: user.language, farmContext: context,
            },
          });
          if (r2.reply) {
            applyFarmActions(r2.reply, farm);
            reply = `${diagnosis}\n\n${r2.displayReply || r2.reply.replace(/\[\[ACTION:[\s\S]*?\]\]/g, "").trim()}`;
          }
        }
      } else {
        const r = await ask({
          data: {
            messages: next.map((m) => ({ role: m.role, content: m.content })),
            language: user.language, farmContext: context,
          },
        });
        reply = r.reply;
        // Use clean display version for the bubble
        const displayText = r.displayReply || r.reply.replace(/\[\[ACTION:[\s\S]*?\]\]/g, "").trim();
        applyFarmActions(r.reply || "", farm);
        setMessages((m) => [...m, { id: String(Date.now() + 1), role: "assistant", content: displayText || "…", ts: Date.now() }]);
        if (user.language === "Twi") speak(displayText);
        return; // already set message above
      }
      const { clean } = applyFarmActions(reply || "…", farm);
      setMessages((m) => [...m, { id: String(Date.now() + 1), role: "assistant", content: clean || "…", ts: Date.now() }]);
      if (user.language === "Twi") speak(clean);
    } catch {
      setMessages((m) => [...m, { id: String(Date.now() + 2), role: "assistant", content: "I'm having a little trouble right now, please try again.", ts: Date.now() }]);
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
    setPendingImage(dataUrl);
    e.target.value = "";
  }

  function onVoiceTurn(userText: string, amaText: string) {
    setMessages((m) => [
      ...m,
      { id: String(Date.now()), role: "user", content: userText, ts: Date.now() },
      { id: String(Date.now() + 1), role: "assistant", content: amaText, ts: Date.now() + 1 },
    ]);
    applyFarmActions(amaText, farm);
  }

  const suggestions = ["How are things going?", "Water quality tips", "Any disease signs?", "Market prices today"];

  function startNewChat() {
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const newId = String(Date.now());
    setSessionId(newId);
    const welcome: ChatMessage = { id: "1", role: "assistant", ts: Date.now(), content: `Hey ${firstName(user.name)}! Good ${timeGreet} 😊 I'm Fish Doctor. How are you and your fish doing today?` };
    setMessages([welcome]);
    Store.setChat([welcome]);
    setShowHistory(false);
  }

  function loadSession(session: ChatSession) {
    setSessionId(session.id);
    setMessages(session.messages);
    Store.setChat(session.messages);
    setShowHistory(false);
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: COLOR.bg }}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${COLOR.div}` }}>
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={COLOR.text} /></button>
        <div className="text-center">
          <div className="text-[16px] font-bold" style={{ color: COLOR.text }}>Fish Doctor</div>
          <div className="text-[11px]" style={{ color: COLOR.muted }}>Your AI Companion</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startNewChat}
            aria-label="New chat"
            title="New Chat"
            className="h-9 w-9 rounded-full flex items-center justify-center"
            style={{ background: COLOR.card, border: `1px solid ${COLOR.gold}` }}
          >
            <SquarePen size={15} color={COLOR.gold} />
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Chat history"
            title="History"
            className="h-9 w-9 rounded-full flex items-center justify-center"
            style={{ background: showHistory ? COLOR.gold : COLOR.card, border: `1px solid ${COLOR.gold}` }}
          >
            <History size={15} color={showHistory ? COLOR.bg : COLOR.gold} />
          </button>
          <button
            onClick={() => setVoiceCall(true)}
            aria-label="Start voice call"
            className="h-9 w-9 rounded-full flex items-center justify-center"
            style={{ background: COLOR.card, border: `1px solid ${COLOR.gold}` }}
          >
            <Phone size={15} color={COLOR.gold} />
          </button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute inset-0 z-40 flex flex-col" style={{ background: COLOR.bg, top: 73 }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${COLOR.div}` }}>
            <div className="text-[14px] font-semibold" style={{ color: COLOR.text }}>Recent Chats</div>
            <button onClick={() => setShowHistory(false)}><X size={20} color={COLOR.muted} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {Store.getChatSessions().length === 0 ? (
              <div className="text-center py-10 text-[13px]" style={{ color: COLOR.muted }}>No saved chats yet.</div>
            ) : (
              Store.getChatSessions().map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s)}
                  className="w-full text-left rounded-xl px-4 py-3 flex items-start justify-between gap-3"
                  style={{ background: s.id === sessionId ? COLOR.card2 : COLOR.card, border: `1px solid ${s.id === sessionId ? COLOR.gold : COLOR.div}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: COLOR.text }}>{s.title}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLOR.muted }}>
                      {s.messages.length - 1} messages · {new Date(s.ts).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <MessageCircle size={14} color={COLOR.gold} style={{ flexShrink: 0, marginTop: 2 }} />
                </button>
              ))
            )}
          </div>
          <div className="px-4 pb-6 pt-2">
            <button
              onClick={startNewChat}
              className="w-full rounded-xl h-12 flex items-center justify-center gap-2 text-[14px] font-semibold"
              style={{ background: COLOR.gold, color: COLOR.bg }}
            >
              <SquarePen size={16} /> New Chat
            </button>
          </div>
        </div>
      )}


      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4 no-scrollbar">
        {messages.map((m, idx) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex gap-2"}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden" style={{ border: `1px solid ${COLOR.gold}` }}>
                <img src="/logo.png" alt="Fish Doctor" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="max-w-[78%]">
              {m.role === "assistant" && <div className="mb-1"><Eyebrow gold>FISH DOCTOR</Eyebrow></div>}
              <div
                className="rounded-2xl px-4 py-2.5 text-[14.5px] leading-snug"
                style={{
                  background: m.role === "user" ? COLOR.card2 : COLOR.card,
                  border: `1px solid ${m.role === "user" ? COLOR.goldSoft : COLOR.div}`,
                  color: COLOR.text,
                  borderTopRightRadius: m.role === "user" ? 6 : undefined,
                  borderTopLeftRadius: m.role === "assistant" ? 6 : undefined,
                }}
              >
                {m.image && <img src={m.image} alt="" className="mb-2 rounded-lg max-h-48 object-cover" />}
                {m.role === "assistant"
                  ? !animatedIds.current.has(m.id)
                    ? <Typewriter text={m.content} speed={2} onDone={() => animatedIds.current.add(m.id)} />
                    : <>{renderMarkdown(m.content)}</>
                  : m.content
                }
              </div>
              <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-right" : ""}`} style={{ color: COLOR.muted }}>
                {new Date(m.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="h-8 w-8 rounded-full overflow-hidden" style={{ border: `1px solid ${COLOR.gold}` }}><img src="/logo.png" alt="Ama" className="h-full w-full object-cover" /></div>
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
        onSubmit={(e) => { e.preventDefault(); send(input, pendingImage ?? undefined); }}
        className="px-3 pt-2 pb-5"
        style={{ background: COLOR.bg, borderTop: `1px solid ${COLOR.div}` }}
      >
        {pendingImage && (
          <div className="mb-2 flex items-start gap-2 rounded-xl p-2" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
            <img src={pendingImage} alt="preview" className="h-16 w-16 rounded-lg object-cover" />
            <div className="flex-1 text-[12px]" style={{ color: COLOR.muted }}>
              Image attached. Add a message or tap send.
            </div>
            <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove image" className="p-1"><X size={16} color={COLOR.muted} /></button>
          </div>
        )}
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
            placeholder={recording ? "Listening…" : pendingImage ? "Add a message (optional)" : "Ask Fish Doctor..."}
            className="flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: COLOR.text }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="p-1" aria-label="Attach image">
            <ImageIcon size={20} color={pendingImage ? COLOR.gold : COLOR.muted} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          <button type="submit" disabled={loading || (!input.trim() && !pendingImage)} aria-label="Send" className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-50" style={{ background: COLOR.gold }}>
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

// ---------- Voice Call (Gemini Live – real-time bidirectional audio) ----------
function VoiceCall({
  user, farm, onTurn, onClose,
}: { user: User; farm: Farm; onTurn: (u: string, a: string) => void; onClose: () => void }) {
  const [status, setStatus] = useState<"connecting" | "listening" | "thinking" | "speaking" | "error">("connecting");
  const [level, setLevel] = useState(0);
  const [lastUser, setLastUser] = useState("");
  const [lastFishDoctor, setLastFishDoctor] = useState("");
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const callRef = useRef<import("@/lib/gemini-live").GeminiLiveCall | null>(null);
  const lastUserRef = useRef("");

  useEffect(() => {
    const context = `You are speaking with a fish farmer. Their farm: pondCount=${farm.pondCount}, fishCount=${farm.fishCount}, fishType=${farm.fishType}, fishSize=${farm.fishSize}, farmName=${user.farmName}, region=${user.region}. Farmer language preference: ${user.language}. ${SYSTEM_PROMPT}`;

    import("@/lib/gemini-live").then(({ GeminiLiveCall }) => {
      const call = new GeminiLiveCall(context, {
        onStatusChange: (s) => setStatus(s),
        onUserText: (t) => { lastUserRef.current = t; setLastUser(t); },
        onAssistantText: (t) => { setLastFishDoctor(t); onTurn(lastUserRef.current, t); },
        onLevel: (l) => setLevel(l),
        onError: (e) => setErrorMsg(e),
      });
      callRef.current = call;
      void call.start();
    });

    return () => { callRef.current?.stop(); callRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function end() { callRef.current?.stop(); callRef.current = null; onClose(); }

  const ring = Math.min(1, level * 6);
  const statusLabel =
    status === "connecting" ? "Connecting…" :
    status === "listening" ? (muted ? "Muted" : "Listening…") :
    status === "thinking" ? "Fish Doctor is thinking…" :
    status === "speaking" ? "Fish Doctor is speaking…" : "Error";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between px-6 py-10" style={{ background: "rgba(15,15,18,0.98)" }}>
      <div className="w-full flex items-center justify-between">
        <div className="text-[12px] uppercase tracking-[0.18em]" style={{ color: COLOR.muted }}>Live with Fish Doctor</div>
        <button onClick={end} aria-label="Close" className="p-1"><X size={22} color={COLOR.muted} /></button>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center">
          <span className="absolute rounded-full" style={{ width: 220 + ring * 60, height: 220 + ring * 60, background: "transparent", border: `1px solid ${COLOR.goldSoft}`, opacity: 0.5, transition: "all 80ms linear" }} />
          <span className="absolute rounded-full" style={{ width: 170 + ring * 40, height: 170 + ring * 40, background: COLOR.card, border: `1px solid ${COLOR.gold}`, transition: "all 80ms linear" }} />
          <div className="relative h-32 w-32 rounded-full overflow-hidden flex items-center justify-center" style={{ background: COLOR.card2, border: `2px solid ${COLOR.gold}` }}>
            {status === "thinking" || status === "connecting" ? (
              <Loader2 size={36} color={COLOR.gold} className="animate-spin" />
            ) : status === "speaking" ? (
              <Volume2 size={36} color={COLOR.gold} />
            ) : (
              <img src="/logo.png" alt="Fish Doctor" className="h-full w-full object-cover" />
            )}
          </div>
        </div>

        <div className="text-center">
          <div className="text-[18px] font-semibold" style={{ color: COLOR.text }}>Fish Doctor</div>
          <div className="text-[13px] mt-1" style={{ color: status === "error" ? COLOR.danger : COLOR.gold }}>{statusLabel}</div>
          {errorMsg && <div className="text-[11px] mt-1 px-4 text-center" style={{ color: COLOR.danger }}>{errorMsg}</div>}
        </div>

        <div className="max-w-sm w-full space-y-2 min-h-[80px]">
          {lastUser && (
            <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}`, color: COLOR.muted }}>
              <span style={{ color: COLOR.gold }}>You: </span>{lastUser}
            </div>
          )}
          {lastFishDoctor && (
            <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: COLOR.card2, border: `1px solid ${COLOR.goldSoft}`, color: COLOR.text }}>
              <span style={{ color: COLOR.gold }}>Fish Doctor: </span>{lastFishDoctor}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}
          className="h-14 w-14 rounded-full flex items-center justify-center"
          style={{ background: muted ? COLOR.card2 : COLOR.card, border: `1px solid ${muted ? COLOR.danger : COLOR.div}` }}>
          <Mic size={22} color={muted ? COLOR.danger : COLOR.text} />
        </button>
        <button onClick={end} aria-label="End call" className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: COLOR.danger }}>
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ---------- Pond Journal ----------
export function PondJournal({ farm: initialFarm, onBack }: { farm: Farm; onBack: () => void }) {
  const [logs, setLogs] = useState<import("@/lib/storage").PondLog[]>(() => Store.getPondLogs());
  const [view, setView] = useState<"log" | "history">("log");
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [waterColor, setWaterColor] = useState<import("@/lib/storage").PondLog["waterColor"]>("");
  const [phLevel, setPhLevel] = useState("");
  const [temp, setTemp] = useState("");
  const [fishBehavior, setFishBehavior] = useState<import("@/lib/storage").PondLog["fishBehavior"]>("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    setPhoto(dataUrl); e.target.value = "";
  }

  function saveLog() {
    const entry: import("@/lib/storage").PondLog = {
      id: String(Date.now()), date: today,
      waterColor, phLevel, temp, fishBehavior, notes,
      photo: photo ?? undefined,
    };
    const next = [entry, ...logs];
    Store.setPondLogs(next); setLogs(next); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    // reset
    setWaterColor(""); setPhLevel(""); setTemp(""); setFishBehavior(""); setNotes(""); setPhoto(null);
  }

  const waterColors: { v: import("@/lib/storage").PondLog["waterColor"]; label: string; dot: string }[] = [
    { v: "clear", label: "Clear", dot: "#A0D8EF" },
    { v: "green", label: "Green", dot: "#6BCB77" },
    { v: "brown", label: "Brown", dot: "#A0724A" },
    { v: "murky", label: "Murky", dot: "#8A7A60" },
  ];
  const behaviors: { v: import("@/lib/storage").PondLog["fishBehavior"]; label: string }[] = [
    { v: "normal", label: "Normal" },
    { v: "feeding-well", label: "Feeding well" },
    { v: "surfacing", label: "Surfacing" },
    { v: "sluggish", label: "Sluggish" },
  ];

  const canSave = waterColor || fishBehavior || notes.trim() || phLevel || temp;

  return (
    <Shell>
      <TopBar onBack={onBack} title="Pond Journal" />
      <div className="px-5 pb-8 space-y-4">
        {/* Tab */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${COLOR.div}` }}>
          {(["log", "history"] as const).map((t) => (
            <button key={t} onClick={() => setView(t)} className="flex-1 py-2.5 text-[13px] font-semibold"
              style={{ background: view === t ? COLOR.gold : COLOR.card, color: view === t ? COLOR.bg : COLOR.muted }}>
              {t === "log" ? "Log Today" : `History (${logs.length})`}
            </button>
          ))}
        </div>

        {view === "log" && (
          <>
            <AmaBubble>Log your pond conditions daily — it helps me spot patterns and give you better advice!</AmaBubble>

            {/* Water color */}
            <Card>
              <Eyebrow gold>Water colour</Eyebrow>
              <div className="mt-3 flex gap-2 flex-wrap">
                {waterColors.map(({ v, label, dot }) => (
                  <button key={v} onClick={() => setWaterColor(waterColor === v ? "" : v)}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px]"
                    style={{ border: `1px solid ${waterColor === v ? COLOR.gold : COLOR.div}`, color: waterColor === v ? COLOR.gold : COLOR.muted }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            {/* Fish behaviour */}
            <Card>
              <Eyebrow gold>Fish behaviour</Eyebrow>
              <div className="mt-3 flex gap-2 flex-wrap">
                {behaviors.map(({ v, label }) => (
                  <button key={v} onClick={() => setFishBehavior(fishBehavior === v ? "" : v)}
                    className="px-3 h-8 rounded-full text-[12px]"
                    style={{ border: `1px solid ${fishBehavior === v ? COLOR.gold : COLOR.div}`, color: fishBehavior === v ? COLOR.gold : COLOR.muted }}>
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            {/* pH & Temp */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="pH Level (optional)">
                <input inputMode="decimal" value={phLevel} onChange={(e) => setPhLevel(e.target.value)}
                  placeholder="e.g. 7.2" className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} />
              </Field>
              <Field label="Water Temp °C">
                <input inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)}
                  placeholder="e.g. 28" className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} />
              </Field>
            </div>

            {/* Notes */}
            <div className="rounded-xl px-4 py-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.div}` }}>
              <Eyebrow>Notes</Eyebrow>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Any observations — dead fish, unusual smell, feed leftovers…"
                rows={3} className="mt-2 w-full bg-transparent outline-none text-[14px] resize-none"
                style={{ color: COLOR.text }} />
            </div>

            {/* Photo */}
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl overflow-hidden"
              style={{ border: `1.5px dashed ${photo ? COLOR.gold : COLOR.goldSoft}` }}>
              {photo ? (
                <div className="relative">
                  <img src={photo} alt="pond" className="w-full h-36 object-cover" />
                  <div className="absolute top-2 right-2 rounded-full p-1.5" style={{ background: "rgba(0,0,0,0.6)" }}>
                    <Camera size={14} color={COLOR.gold} />
                  </div>
                </div>
              ) : (
                <div className="py-5 flex flex-col items-center gap-1">
                  <Camera size={22} color={COLOR.goldSoft} />
                  <div className="text-[12px]" style={{ color: COLOR.muted }}>Add pond photo (optional)</div>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickPhoto} />

            {saved && (
              <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: "#1A4A1A", border: `1px solid ${COLOR.ok}` }}>
                <CheckCircle2 size={18} color={COLOR.ok} />
                <span className="text-[13px]" style={{ color: COLOR.ok }}>Log saved for today!</span>
              </div>
            )}

            <Btn variant="solid" onClick={saveLog} disabled={!canSave}>Save Today's Log</Btn>
          </>
        )}

        {view === "history" && (
          <>
            {logs.length === 0 ? (
              <Card><div className="text-[13px] text-center py-4" style={{ color: COLOR.muted }}>No logs yet. Start logging today to track your pond over time.</div></Card>
            ) : (
              <div className="space-y-3">
                {logs.map((l) => (
                  <Card key={l.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-[13px] font-bold" style={{ color: COLOR.text }}>{new Date(l.date).toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" })}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {l.waterColor && <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: COLOR.card2, color: COLOR.text }}>💧 {l.waterColor}</span>}
                          {l.fishBehavior && <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: COLOR.card2, color: COLOR.text }}>🐟 {l.fishBehavior}</span>}
                          {l.phLevel && <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: COLOR.card2, color: COLOR.text }}>pH {l.phLevel}</span>}
                          {l.temp && <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: COLOR.card2, color: COLOR.text }}>{l.temp}°C</span>}
                        </div>
                        {l.notes && <div className="mt-1.5 text-[12px]" style={{ color: COLOR.muted }}>{l.notes}</div>}
                      </div>
                      {l.photo && <img src={l.photo} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
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

// ---------- Sell (legacy redirect kept for compat) ----------
export function Sell({ user, farm, onBack }: { user: User; farm: Farm; onBack: () => void }) {
  return <Marketplace user={user} farm={farm} onBack={onBack} />;
}

// ---------- Marketplace: Sell Fish / Buy Fish ----------
export function Marketplace({ user, farm, onBack }: { user: User; farm: Farm; onBack: () => void }) {
  const gen = useServerFn(generateBuyers);
  const [tab, setTab] = useState<"listings" | "post">("listings");
  const [listings, setListings] = useState<FishListing[]>(() => Store.getListings());
  const [buyers, setBuyers] = useState<{ buyer_name: string; location: string; quantity_kg: number; fish_type: string; price_per_kg: number; urgent: boolean }[]>([]);
  const [loadingBuyers, setLoadingBuyers] = useState(true);

  // New listing form
  const [postType, setPostType] = useState<"sell" | "buy">("sell");
  const [fishType, setFishType] = useState(farm.fishType || "");
  const [quantity, setQuantity] = useState(farm.fishCount || 0);
  const [price, setPrice] = useState(0);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoadingBuyers(true);
    gen({ data: {} }).then((r) => setBuyers(r.buyers)).catch(() => {}).finally(() => setLoadingBuyers(false));
  }, [gen]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    setImage(dataUrl);
    e.target.value = "";
  }

  function postListing() {
    if (!fishType.trim() || quantity <= 0 || price <= 0) return;
    setPosting(true);
    const listing: FishListing = {
      id: String(Date.now()),
      sellerName: user.name,
      sellerPhone: user.phone,
      region: user.region,
      fishType,
      quantity,
      pricePerKg: price,
      description,
      image: image ?? undefined,
      ts: Date.now(),
      isBuying: postType === "buy",
    };
    const next = [listing, ...listings];
    Store.setListings(next);
    setListings(next);
    setPosting(false);
    setTab("listings");
    // reset form
    setFishType(farm.fishType || ""); setQuantity(0); setPrice(0); setDescription(""); setImage(null);
  }

  const cfg = farm.fishSize === "Fingerling" ? 120 : farm.fishSize === "Medium" ? 60 : 14;
  const stock = farm.stockDate ? new Date(farm.stockDate) : null;
  const daysReady = stock ? Math.max(0, cfg - daysBetween(stock, new Date())) : cfg;

  return (
    <Shell>
      <TopBar onBack={onBack} title="Sell Fish" />
      <div className="px-5 pb-8 space-y-4">

        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${COLOR.div}` }}>
          {(["listings", "post"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-[13px] font-semibold"
              style={{ background: tab === t ? COLOR.gold : COLOR.card, color: tab === t ? COLOR.bg : COLOR.muted }}
            >
              {t === "listings" ? "Browse" : "+ Post"}
            </button>
          ))}
        </div>

        {tab === "listings" && (
          <>
            {/* My listing summary */}
            <Card accent>
              <div className="flex items-center justify-between">
                <Eyebrow gold>Your Farm</Eyebrow>
                <span className="text-[12px]" style={{ color: COLOR.gold }}>Ready in {daysReady}d</span>
              </div>
              <div className="mt-2 text-[15px] font-bold" style={{ color: COLOR.text }}>{farm.fishCount.toLocaleString()} {farm.fishType || "Fish"}</div>
              <div className="text-[12px]" style={{ color: COLOR.muted }}>{user.farmName} · {user.region}</div>
            </Card>

            {/* Community listings */}
            {listings.length > 0 && (
              <>
                <Eyebrow gold>Community Listings</Eyebrow>
                <div className="space-y-2">
                  {listings.map((l) => (
                    <Card key={l.id}>
                      <div className="flex gap-3">
                        {l.image && <img src={l.image} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <div className="text-[14px] font-bold truncate" style={{ color: COLOR.text }}>{l.fishType}</div>
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0" style={{ background: l.isBuying ? "#1A3A4A" : "#1A4A1A", color: l.isBuying ? "#6BB8CB" : COLOR.ok }}>
                              {l.isBuying ? "BUYING" : "SELLING"}
                            </span>
                          </div>
                          <div className="text-[13px] font-bold mt-0.5" style={{ color: COLOR.gold }}>{fmtGHS(l.pricePerKg)}/kg · {l.quantity.toLocaleString()} fish</div>
                          {l.description && <div className="text-[11px] mt-0.5 truncate" style={{ color: COLOR.muted }}>{l.description}</div>}
                          <div className="text-[11px] mt-1" style={{ color: COLOR.muted }}>{l.sellerName} · {l.region}</div>
                        </div>
                      </div>
                      <button className="mt-2 w-full py-1.5 rounded-lg text-[12px] font-semibold" style={{ border: `1px solid ${COLOR.goldSoft}`, color: COLOR.gold }}>
                        Contact · {l.sellerPhone}
                      </button>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {/* AI Buyer requests */}
            <Eyebrow gold>Buyer Requests</Eyebrow>
            {loadingBuyers && <div className="flex justify-center py-6"><Spinner /></div>}
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
                  <div className="text-[11px]" style={{ color: COLOR.muted }}>{b.location}</div>
                </Card>
              ))}
            </div>
          </>
        )}

        {tab === "post" && (
          <div className="space-y-4">
            <AmaBubble>Post your fish for sale or let others know you're looking to buy. The whole community can see it!</AmaBubble>

            {/* Sell / Buy toggle */}
            <div className="flex gap-2">
              {(["sell", "buy"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPostType(t)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ border: `1px solid ${postType === t ? COLOR.gold : COLOR.div}`, color: postType === t ? COLOR.gold : COLOR.muted, background: COLOR.card }}
                >
                  {t === "sell" ? "🐟 I want to sell" : "🛒 I want to buy"}
                </button>
              ))}
            </div>

            {/* Fish photo upload */}
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl overflow-hidden" style={{ border: `1.5px dashed ${image ? COLOR.gold : COLOR.goldSoft}` }}>
              {image ? (
                <div className="relative">
                  <img src={image} alt="fish" className="w-full h-48 object-cover" />
                  <div className="absolute top-2 right-2 rounded-full p-1.5" style={{ background: "rgba(0,0,0,0.6)" }}>
                    <Camera size={16} color={COLOR.gold} />
                  </div>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center gap-2">
                  <Camera size={28} color={COLOR.gold} />
                  <div className="text-[13px] font-semibold" style={{ color: COLOR.gold }}>Add Fish Photo</div>
                  <div className="text-[11px]" style={{ color: COLOR.muted }}>Upload a photo to attract buyers</div>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickImage} />

            <Field label="Fish Type">
              <input
                list="fish-suggestions"
                value={fishType}
                onChange={(e) => setFishType(e.target.value)}
                placeholder="e.g. Tilapia, Catfish"
                className="w-full bg-transparent outline-none text-[15px]"
                style={{ color: COLOR.text }}
              />
              <datalist id="fish-suggestions-market">
                {["Tilapia", "Catfish", "Heterotis", "Mudfish", "Carp"].map((s) => <option key={s} value={s} />)}
              </datalist>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity (fish)">
                <input
                  inputMode="numeric"
                  value={quantity || ""}
                  onChange={(e) => setQuantity(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                  placeholder="e.g. 100"
                  className="w-full bg-transparent outline-none text-[15px]"
                  style={{ color: COLOR.text }}
                />
              </Field>
              <Field label="Price/kg (GHS)">
                <input
                  inputMode="numeric"
                  value={price || ""}
                  onChange={(e) => setPrice(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                  placeholder="e.g. 35"
                  className="w-full bg-transparent outline-none text-[15px]"
                  style={{ color: COLOR.text }}
                />
              </Field>
            </div>

            <Field label="Description (optional)">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Any extra details about your fish..."
                className="w-full bg-transparent outline-none text-[15px]"
                style={{ color: COLOR.text }}
              />
            </Field>

            <Btn
              variant="solid"
              onClick={postListing}
              disabled={posting || !fishType.trim() || quantity <= 0 || price <= 0}
            >
              {posting ? "Posting…" : `Post ${postType === "sell" ? "Fish for Sale" : "Buy Request"}`}
            </Btn>
          </div>
        )}
      </div>
    </Shell>
  );
}

// ---------- Shop ----------
type ShopCategory = "fish" | "feeds" | "medicine";
type ShopListing = {
  id: string;
  sellerName: string;
  sellerPhone: string;
  region: string;
  category: ShopCategory;
  name: string;
  description: string;
  price: number;
  unit: string;
  image?: string;
  ts: number;
};
const SHOP_KEY = "ffo.shop";
function getShopListings(): ShopListing[] {
  if (typeof window === "undefined") return [];
  try { const v = window.localStorage.getItem(SHOP_KEY); return v ? (JSON.parse(v) as ShopListing[]) : []; } catch { return []; }
}
function setShopListings(l: ShopListing[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SHOP_KEY, JSON.stringify(l)); } catch {}
}

export function Shop({ user, onBack }: { user: User; onBack: () => void }) {
  const [tab, setTab] = useState<"browse" | "post">("browse");
  const [category, setCategory] = useState<ShopCategory>("fish");
  const [listings, setListings] = useState<ShopListing[]>(() => getShopListings());
  // post form
  const [postCat, setPostCat] = useState<ShopCategory>("fish");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [unit, setUnit] = useState("kg");
  const [image, setImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const CATS: { key: ShopCategory; label: string; emoji: string }[] = [
    { key: "fish", label: "Fish", emoji: "🐟" },
    { key: "feeds", label: "Feeds", emoji: "🌾" },
    { key: "medicine", label: "Medicine", emoji: "💊" },
  ];

  const filtered = listings.filter((l) => l.category === category);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    setImage(dataUrl); e.target.value = "";
  }

  function post() {
    if (!name.trim() || price <= 0) return;
    setPosting(true);
    const item: ShopListing = {
      id: String(Date.now()),
      sellerName: user.name,
      sellerPhone: user.phone,
      region: user.region,
      category: postCat,
      name: name.trim(),
      description: description.trim(),
      price,
      unit,
      image: image ?? undefined,
      ts: Date.now(),
    };
    const next = [item, ...listings];
    setShopListings(next);
    setListings(next);
    setPosting(false);
    setTab("browse");
    setCategory(postCat);
    setName(""); setDescription(""); setPrice(0); setUnit("kg"); setImage(null);
  }

  return (
    <Shell>
      <TopBar onBack={onBack} title="Shop" />
      <div className="px-5 pb-8 space-y-4">

        {/* Main tab */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${COLOR.div}` }}>
          {(["browse", "post"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-2.5 text-[13px] font-semibold"
              style={{ background: tab === t ? COLOR.gold : COLOR.card, color: tab === t ? COLOR.bg : COLOR.muted }}>
              {t === "browse" ? "Browse" : "+ List Item"}
            </button>
          ))}
        </div>

        {tab === "browse" && (
          <>
            {/* Category pills */}
            <div className="flex gap-2">
              {CATS.map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className="flex-1 py-2 rounded-xl text-[13px] font-semibold"
                  style={{ border: `1px solid ${category === c.key ? COLOR.gold : COLOR.div}`, color: category === c.key ? COLOR.gold : COLOR.muted, background: COLOR.card }}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <ShoppingBag size={32} color={COLOR.muted} />
                <div className="text-[13px]" style={{ color: COLOR.muted }}>No {category} listed yet.</div>
                <button onClick={() => setTab("post")} className="text-[13px] font-semibold" style={{ color: COLOR.gold }}>Be the first to list →</button>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((l) => (
                  <Card key={l.id}>
                    <div className="flex gap-3">
                      {l.image && <img src={l.image} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div className="text-[14px] font-bold truncate" style={{ color: COLOR.text }}>{l.name}</div>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 uppercase" style={{ background: "#1A3A1A", color: COLOR.ok }}>{l.category}</span>
                        </div>
                        <div className="text-[13px] font-bold mt-0.5" style={{ color: COLOR.gold }}>{fmtGHS(l.price)}/{l.unit}</div>
                        {l.description && <div className="text-[11px] mt-0.5" style={{ color: COLOR.muted }}>{l.description}</div>}
                        <div className="text-[11px] mt-1" style={{ color: COLOR.muted }}>{l.sellerName} · {l.region}</div>
                      </div>
                    </div>
                    <button className="mt-2 w-full py-1.5 rounded-lg text-[12px] font-semibold"
                      style={{ border: `1px solid ${COLOR.goldSoft}`, color: COLOR.gold }}>
                      Contact · {l.sellerPhone}
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "post" && (
          <div className="space-y-4">
            <AmaBubble>List your fish, feeds, or medicine for other farmers to buy. Add a photo to get more attention!</AmaBubble>

            {/* Category selector */}
            <div className="flex gap-2">
              {CATS.map((c) => (
                <button key={c.key} onClick={() => setPostCat(c.key)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ border: `1px solid ${postCat === c.key ? COLOR.gold : COLOR.div}`, color: postCat === c.key ? COLOR.gold : COLOR.muted, background: COLOR.card }}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>

            {/* Photo */}
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl overflow-hidden"
              style={{ border: `1.5px dashed ${image ? COLOR.gold : COLOR.goldSoft}` }}>
              {image ? (
                <div className="relative">
                  <img src={image} alt="" className="w-full h-48 object-cover" />
                  <div className="absolute top-2 right-2 rounded-full p-1.5" style={{ background: "rgba(0,0,0,0.6)" }}>
                    <Camera size={16} color={COLOR.gold} />
                  </div>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center gap-2">
                  <Camera size={28} color={COLOR.gold} />
                  <div className="text-[13px] font-semibold" style={{ color: COLOR.gold }}>Add Photo</div>
                  <div className="text-[11px]" style={{ color: COLOR.muted }}>Upload a product photo</div>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickImage} />

            <Field label="Product Name">
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={postCat === "fish" ? "e.g. Fresh Tilapia" : postCat === "feeds" ? "e.g. Coppens Feed 3mm" : "e.g. Potassium Permanganate"}
                className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (GHS)">
                <input inputMode="numeric" value={price || ""} onChange={(e) => setPrice(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                  placeholder="e.g. 50" className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} />
              </Field>
              <Field label="Unit">
                <select value={unit} onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }}>
                  {["kg", "bag", "piece", "box", "litre", "sachet"].map((u) => (
                    <option key={u} value={u} style={{ background: COLOR.card }}>{u}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Description (optional)">
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Any details, quantity available, delivery options…"
                className="w-full bg-transparent outline-none text-[15px]" style={{ color: COLOR.text }} />
            </Field>

            <Btn variant="solid" onClick={post} disabled={posting || !name.trim() || price <= 0}>
              {posting ? "Listing…" : "List for Sale"}
            </Btn>
          </div>
        )}
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
export function Profile({ user, farm, score, onBack, onLogout, onGo, onUserUpdate }: { user: User; farm: Farm; score: number; onBack: () => void; onLogout: () => void; onGo: (s: Screen) => void; onUserUpdate?: (u: User) => void }) {
  const [twi, setTwi] = useState(() => typeof window !== "undefined" && localStorage.getItem("twiVoice") === "true");
  const [briefingOn, setBriefingOn] = useState(() => typeof window !== "undefined" && (localStorage.getItem("ffo.dailyBriefing") ?? "true") === "true");
  const [notifOn, setNotifOn] = useState(() => typeof window !== "undefined" && (localStorage.getItem("ffo.notifEnabled") ?? "true") === "true");
  const [keyOpen, setKeyOpen] = useState(false); const [keyVal, setKeyVal] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem("twiVoice", String(twi)); }, [twi]);
  useEffect(() => { localStorage.setItem("ffo.dailyBriefing", String(briefingOn)); }, [briefingOn]);
  useEffect(() => { localStorage.setItem("ffo.notifEnabled", String(notifOn)); }, [notifOn]);
  useEffect(() => { setKeyVal(localStorage.getItem("khayaApiKey") ?? ""); }, []);

  const tier = score <= 40 ? "NEW FARMER" : score <= 70 ? "GROWING FARMER" : "TRUSTED FARMER";

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    const next = { ...user, avatar: dataUrl };
    Store.setUser(next);
    onUserUpdate?.(next);
    e.target.value = "";
  }

  return (
    <Shell>
      <TopBar onBack={onBack} title="Profile" />
      <div className="px-5 pb-10 space-y-4">
        <Card>
          <div className="flex flex-col items-center">
            <button onClick={() => avatarRef.current?.click()} className="relative h-24 w-24 rounded-full overflow-hidden flex items-center justify-center text-[24px] font-bold" style={{ background: COLOR.card2, border: `2px solid ${COLOR.gold}`, color: COLOR.text }}>
              {user.avatar ? (
                <img src={user.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera size={28} color={COLOR.gold} />
              )}
              <span className="absolute bottom-0 right-0 h-7 w-7 rounded-full flex items-center justify-center" style={{ background: COLOR.gold }}><Camera size={14} color={COLOR.bg} /></span>
            </button>
            <input ref={avatarRef} type="file" accept="image/*" hidden onChange={onAvatar} />
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
          <button onClick={() => { if (confirm("Log out of Fish Doctor?")) onLogout(); }} className="w-full rounded-xl p-4 flex items-center justify-center gap-2 mt-3" style={{ background: COLOR.gold, color: COLOR.bg }}>
            <LogIn size={18} />
            <span className="text-[14px] font-semibold">Log Out</span>
          </button>
        </div>

        <div className="text-center text-[11px]" style={{ color: COLOR.nav }}>Fish Doctor Ghana v1.0 · Made in Ghana</div>
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

// ---------- Notifications (AI alerts) ----------
export function Notifications({ notifs, onBack, onRead }: { notifs: Notif[]; onBack: () => void; onRead: () => void }) {
  useEffect(() => { onRead(); }, [onRead]);

  const kindIcon = (kind: Notif["kind"]) => {
    if (kind === "ai") return <Fish size={18} color={COLOR.gold} className="mt-0.5" />;
    if (kind === "weather") return <Cloud size={18} color={COLOR.warn} className="mt-0.5" />;
    if (kind === "harvest") return <TrendingUp size={18} color={COLOR.gold} className="mt-0.5" />;
    if (kind === "feed") return <Layers size={18} color={COLOR.gold} className="mt-0.5" />;
    return <Bell size={18} color={COLOR.gold} className="mt-0.5" />;
  };

  return (
    <Shell>
      <TopBar onBack={onBack} title="Notifications" />
      <div className="px-5 pb-8 space-y-2">
        {notifs.length === 0 && (
          <Card>
            <div className="flex flex-col items-center py-6 gap-2">
              <Bell size={32} color={COLOR.muted} />
              <div className="text-[13px]" style={{ color: COLOR.muted }}>You're all caught up!</div>
              <div className="text-[11px] text-center" style={{ color: COLOR.nav }}>Fish Doctor will notify you about your fish, weather, and market updates here.</div>
            </div>
          </Card>
        )}
        {notifs.slice().reverse().map((n) => (
          <Card key={n.id} className={n.read ? "" : "opacity-100"}>
            <div className="flex items-start gap-3">
              {kindIcon(n.kind)}
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[14px] font-bold" style={{ color: COLOR.text }}>{n.title}</div>
                  {!n.read && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLOR.gold }} />}
                </div>
                <div className="text-[13px] mt-0.5 leading-relaxed" style={{ color: COLOR.muted }}>{n.body}</div>
                <div className="mt-1 text-[10px]" style={{ color: COLOR.nav }}>{new Date(n.ts).toLocaleString()}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
