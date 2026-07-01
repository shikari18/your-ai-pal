import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Splash, Register, Onboarding1, Onboarding2, Onboarding3,
  Dashboard, Chat, FeedCalc, PondJournal, Weather, Market, Sell, Marketplace, Shop,
  CreditScore, Profile, Notifications, BottomNav, Shell,
  type Screen,
} from "@/components/screens";
import { Store, type User, type Farm, type Notif } from "@/lib/storage";
import { fetchWeather, type WeatherSnapshot } from "@/lib/weather";
import { generateBriefing } from "@/lib/groq.functions";
import { speak } from "@/lib/voice";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Fish Doctor Ghana" }] }),
  component: App,
});

const NAV_SCREENS: Screen[] = ["dashboard", "chat", "notifications", "profile"];

function App() {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("splash");
  const [user, setUser] = useState<User | null>(null);
  const [farm, setFarm] = useState<Farm>({ pondCount: 1, fishCount: 0, fishType: "", fishSize: "", stockDate: "" });
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const genBrief = useServerFn(generateBriefing);

  // hydrate from localStorage on mount
  useEffect(() => {
    const u = Store.getUser();
    const f = Store.getFarm();
    setUser(u); setFarm(f); setNotifs(Store.getNotifs());
    if (u && f.fishType) setScreen("dashboard");
    setHydrated(true);
  }, []);

  // Handle farm updates from chat (AI actions)
  function handleFarmUpdate(updated: Farm) {
    setFarm(updated);
    Store.setFarm(updated);
  }

  // load weather + briefing when dashboard ready
  const refreshWeatherAndBriefing = useCallback(async (u: User, f: Farm) => {
    let w: WeatherSnapshot | null = null;
    if (f.lat && f.lon) {
      try { w = await fetchWeather(f.lat, f.lon); setWeather(w); } catch {}
    }

    // Only generate briefing occasionally (not every load) — use as a reminder
    const lastBriefTs = Number(localStorage.getItem("ffo.lastBriefTs") || "0");
    const hoursSinceLast = (Date.now() - lastBriefTs) / 3_600_000;
    const shouldBrief = hoursSinceLast >= 6; // at most every 6 hours

    if (shouldBrief) {
      setRefreshing(true);
      try {
        const summary = w ? `${w.current.condition}, ${w.current.temp}°C, rain probability next 6h ${w.hourlyPrecipMaxNext6h}%` : "no weather data";
        const hr = new Date().getHours();
        const timeOfDay = hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening";
        const { briefing } = await genBrief({
          data: {
            name: u.name, fishCount: f.fishCount, fishType: f.fishType || "fish",
            farmName: u.farmName, region: u.region, weather: summary, timeOfDay,
          },
        });
        setBriefing(briefing);
        localStorage.setItem("ffo.lastBriefTs", String(Date.now()));
      } catch { setBriefing(null); } finally { setRefreshing(false); }
    }

    // build notifications
    const next: Notif[] = [...Store.getNotifs()];
    function push(n: Omit<Notif, "id" | "ts"> & Partial<Pick<Notif, "id" | "ts">>) {
      const id = `${n.kind}-${new Date().toDateString()}-${n.title}`;
      if (next.some((x) => x.id === id)) return;
      next.push({ id, ts: Date.now(), read: false, ...n } as Notif);
    }

    // Deliver the pond photo analysis as a notification (from onboarding)
    if (f.pondPhotoAnalysis) {
      const pondNotifId = `ai-pond-analysis`;
      if (!next.some((x) => x.id === pondNotifId)) {
        next.push({ id: pondNotifId, ts: Date.now(), read: false, kind: "ai", title: "Pond Analysis Ready", body: f.pondPhotoAnalysis });
      }
    }

    if (w && w.hourlyPrecipMaxNext6h >= 70) push({ kind: "weather", title: "Heavy rain expected", body: "Check pond inlets and reduce feeding today." });
    const lastFeed = Store.getFeed().slice(-1)[0];
    if (!lastFeed || Date.now() - new Date(lastFeed.date).getTime() > 18 * 3600 * 1000)
      push({ kind: "feed", title: "Feeding reminder", body: "It has been more than 18 hours since the last feed log." });
    if (f.stockDate) {
      const cfg = f.fishSize === "Fingerling" ? 120 : f.fishSize === "Medium" ? 60 : 14;
      const elapsed = Math.floor((Date.now() - new Date(f.stockDate).getTime()) / 86_400_000);
      const days = cfg - elapsed;
      if (days >= 0 && days <= 7) push({ kind: "harvest", title: "Harvest approaching", body: `~${days} day(s) to harvest readiness.` });
    }
    Store.setNotifs(next); setNotifs(next);
  }, [genBrief]);

  useEffect(() => {
    if (screen === "dashboard" && user) {
      void refreshWeatherAndBriefing(user, farm);
    }
  // Run once when hitting dashboard
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, user]);

  const profitEstimate = useMemo(() => {
    const w = farm.fishSize === "Fingerling" ? 0.01 : farm.fishSize === "Medium" ? 0.2 : 0.45;
    return farm.fishCount * w * 35;
  }, [farm]);

  if (!hydrated) return <Shell><div /></Shell>;

  // flow control
  if (screen === "splash") return <Splash onStart={() => setScreen("register")} />;
  if (screen === "register")
    return <Register onBack={() => setScreen("splash")} onDone={(u) => { Store.setUser(u); setUser(u); setScreen("onboarding-1"); }} />;
  if (screen === "onboarding-1")
    return user ? <Onboarding1 user={user} onNext={() => setScreen("onboarding-2")} /> : null;
  if (screen === "onboarding-2")
    return <Onboarding2 onNext={() => { setFarm(Store.getFarm()); setScreen("onboarding-3"); }} />;
  if (screen === "onboarding-3")
    return <Onboarding3 onDone={() => { setFarm(Store.getFarm()); setBriefing(null); setScreen("dashboard"); }} />;

  if (!user) { setScreen("splash"); return null; }

  // chat is full screen (no bottom nav, has its own input)
  if (screen === "chat") return <Chat user={user} farm={farm} onBack={() => setScreen("dashboard")} onFarmUpdate={handleFarmUpdate} />;

  const useNav = NAV_SCREENS.includes(screen);

  let body: React.ReactNode = null;
  if (screen === "dashboard") {
    body = (
      <Dashboard
        user={user} farm={farm} notifs={notifs} weather={weather}
        briefing={briefing} profitEstimate={profitEstimate}
        refreshingBriefing={refreshing}
        onListen={() => briefing && speak(briefing)}
        onGo={setScreen}
      />
    );
  } else if (screen === "feed-calc") body = <FeedCalc farm={farm} onBack={() => setScreen("dashboard")} />;
  else if (screen === "pond-journal") body = <PondJournal farm={farm} onBack={() => setScreen("dashboard")} />;
  else if (screen === "weather") body = <Weather farm={farm} user={user} onBack={() => setScreen("dashboard")} />;
  else if (screen === "market") body = <Market user={user} onBack={() => setScreen("dashboard")} />;
  else if (screen === "sell") body = <Sell user={user} farm={farm} onBack={() => setScreen("dashboard")} />;
  else if (screen === "marketplace") body = <Marketplace user={user} farm={farm} onBack={() => setScreen("dashboard")} />;
  else if (screen === "shop") body = <Shop user={user} onBack={() => setScreen("dashboard")} />;
  else if (screen === "credit-score") body = <CreditScore user={user} farm={farm} onBack={() => setScreen("profile")} />;
  else if (screen === "notifications") body = <Notifications notifs={notifs} onBack={() => setScreen("dashboard")} onRead={() => {
    const n = Store.getNotifs().map((x) => ({ ...x, read: true })); Store.setNotifs(n); setNotifs(n);
  }} />;
  else if (screen === "profile") {
    const fl = Store.getFeed();
    const score =
      (user.name && user.phone && user.farmName && farm.lat ? 30 : 15) +
      (farm.pondPhotoAnalysis ? 15 : 0) + Math.min(25, fl.length) +
      (farm.stockDate ? 20 : 0) + (Store.getChat().length > 2 ? 10 : 0);
    body = (
      <Profile
        user={user} farm={farm} score={score}
        onBack={() => setScreen("dashboard")}
        onGo={setScreen}
        onUserUpdate={setUser}
        onLogout={() => { setUser(null); setScreen("splash"); }}
      />
    );
  }

  return (
    <Shell>
      <div className="flex-1">{body}</div>
      {useNav && <BottomNav current={screen} onGo={setScreen} notifCount={notifs.filter((n) => !n.read).length} />}
    </Shell>
  );
}
