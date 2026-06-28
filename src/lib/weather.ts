export type WeatherSnapshot = {
  current: { temp: number; condition: string; icon: "sun" | "cloud" | "rain"; wind: number };
  hourlyPrecipMaxNext6h: number;
  forecast: { day: string; tmin: number; tmax: number; precip: number; icon: "sun" | "cloud" | "rain" }[];
  raw: unknown;
};

function pickIcon(precip: number): "sun" | "cloud" | "rain" {
  if (precip >= 60) return "rain";
  if (precip >= 25) return "cloud";
  return "sun";
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherSnapshot> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,temperature_2m,wind_speed_10m&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FAccra&forecast_days=3&current=temperature_2m,wind_speed_10m,precipitation`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");
  const j = (await res.json()) as any;
  const next6 = (j.hourly?.precipitation_probability ?? []).slice(0, 6) as number[];
  const maxNext6 = next6.length ? Math.max(...next6) : 0;
  const cur = j.current ?? {};
  const dailyDays = ["Today", "Tomorrow", "Day 3"];
  const forecast = (j.daily?.time ?? []).slice(0, 3).map((_t: string, i: number) => ({
    day: dailyDays[i] ?? `Day ${i + 1}`,
    tmin: Math.round(j.daily.temperature_2m_min[i]),
    tmax: Math.round(j.daily.temperature_2m_max[i]),
    precip: j.daily.precipitation_probability_max?.[i] ?? 0,
    icon: pickIcon(j.daily.precipitation_probability_max?.[i] ?? 0),
  }));
  return {
    current: {
      temp: Math.round(cur.temperature_2m ?? 0),
      wind: Math.round(cur.wind_speed_10m ?? 0),
      condition: maxNext6 >= 60 ? "Rain likely" : maxNext6 >= 25 ? "Cloudy" : "Clear",
      icon: pickIcon(maxNext6),
    },
    hourlyPrecipMaxNext6h: maxNext6,
    forecast,
    raw: j,
  };
}
