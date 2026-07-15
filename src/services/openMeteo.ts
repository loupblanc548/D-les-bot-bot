/**
 * openMeteo.ts — Service météo gratuit (Open-Meteo API, sans clé)
 *
 * Docs: https://open-meteo.com/en/docs
 * Geocoding: https://open-meteo.com/en/docs/geocoding-api
 */

import { rateLimitedFetch } from "./apiRateLimiter.js";
import logger from "../utils/logger.js";

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

interface WeatherData {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  is_day: number;
  time: string;
}

interface DailyData {
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  weathercode: number[];
  precipitation_sum: number[];
  sunrise: string[];
  sunset: string[];
  time: string[];
}

const WEATHER_CODES: Record<number, string> = {
  0: "☀️ Ciel dégagé",
  1: "🌤️ Principalement dégagé",
  2: "⛅ Partiellement nuageux",
  3: "☁️ Couvert",
  45: "🌫️ Brouillard",
  48: "🌫️ Brouillard givrant",
  51: "🌦️ Bruine légère",
  53: "🌦️ Bruine modérée",
  55: "🌧️ Bruine dense",
  56: "🌧️ Bruine verglaçante",
  57: "🌧️ Bruine verglaçante dense",
  61: "🌧️ Pluie légère",
  63: "🌧️ Pluie modérée",
  65: "🌧️ Pluie forte",
  66: "🌧️ Pluie verglaçante",
  67: "🌧️ Pluie verglaçante forte",
  71: "🌨️ Neige légère",
  73: "🌨️ Neige modérée",
  75: "❄️ Neige forte",
  77: "❄️ Grains de neige",
  80: "🌧️ Averses légères",
  81: "🌧️ Averses modérées",
  82: "🌧️ Averses violentes",
  85: "🌨️ Averses de neige légères",
  86: "🌨️ Averses de neige fortes",
  95: "⛈️ Orage",
  96: "⛈️ Orage avec grêle légère",
  99: "⛈️ Orage avec grêle forte",
};

export async function searchCity(query: string): Promise<GeoResult | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`;
    const res = await rateLimitedFetch("openmeteo", url);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: GeoResult[] };
    return data.results?.[0] ?? null;
  } catch (err) {
    logger.error("[OpenMeteo] Geocoding error:", err);
    return null;
  }
}

export async function getCurrentWeather(city: string): Promise<{
  city: string;
  country: string;
  temperature: number;
  windspeed: number;
  weathercode: number;
  weatherDesc: string;
  isDay: boolean;
  time: string;
} | null> {
  const geo = await searchCity(city);
  if (!geo) return null;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,wind_speed_10m,weather_code,is_day&timezone=auto`;
  const res = await rateLimitedFetch("openmeteo", url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    current: WeatherData;
  };

  return {
    city: geo.name,
    country: geo.country,
    temperature: Math.round(data.current.temperature),
    windspeed: Math.round(data.current.windspeed),
    weathercode: data.current.weathercode,
    weatherDesc: WEATHER_CODES[data.current.weathercode] ?? "Unknown",
    isDay: data.current.is_day === 1,
    time: data.current.time,
  };
}

export async function getWeatherForecast(
  city: string,
  days = 3,
): Promise<{
  city: string;
  country: string;
  days: { date: string; max: number; min: number; weatherDesc: string; precipitation: number }[];
} | null> {
  const geo = await searchCity(city);
  if (!geo) return null;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,sunrise,sunset&forecast_days=${days}&timezone=auto`;
  const res = await rateLimitedFetch("openmeteo", url);
  if (!res.ok) return null;

  const data = (await res.json()) as { daily: DailyData };

  const forecast = data.daily.time.map((time, i) => ({
    date: time,
    max: Math.round(data.daily.temperature_2m_max[i]),
    min: Math.round(data.daily.temperature_2m_min[i]),
    weatherDesc: WEATHER_CODES[data.daily.weathercode[i]] ?? "Unknown",
    precipitation: data.daily.precipitation_sum[i] ?? 0,
  }));

  return {
    city: geo.name,
    country: geo.country,
    days: forecast,
  };
}
