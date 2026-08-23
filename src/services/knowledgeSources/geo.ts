/**
 * geo.ts — Sources de connaissances géographiques et temporelles
 * Earthquakes, IP Geo, Sunrise/Sunset, Air Quality, Holidays, OpenSky Flight Tracker
 */

export async function fetchEarthquakes(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/s[éèe]isme|earthquake|tremblement/)) return null;

  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        properties?: { mag?: number; place?: string; time?: number; url?: string };
      }>;
    };
    const quakes = (data.features || []).slice(0, 5);
    if (quakes.length === 0) return "Aucun séisme significatif cette semaine.";

    const lines = quakes.map((q) => {
      const p = q.properties || {};
      const date = p.time ? new Date(p.time).toLocaleDateString("fr-FR") : "?";
      return `🌍 M${p.mag || "?"} — ${p.place || "?"} (${date})${p.url ? ` | ${p.url}` : ""}`;
    });
    return `📊 **Séismes significatifs (7 derniers jours):**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

export async function fetchIpGeo(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(
    /(?:localise|g[ée]olocalise|ip info|where is|localisation)\s+(?:l'?ip\s+)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/,
  );
  if (!match) return null;

  const ip = match[1];
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?lang=fr&fields=status,country,regionName,city,zip,lat,lon,timezone,isp,org,as`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      country?: string;
      regionName?: string;
      city?: string;
      zip?: string;
      lat?: number;
      lon?: number;
      timezone?: string;
      isp?: string;
      org?: string;
    };
    if (data.status !== "success") return null;
    return `🌍 **IP ${ip}**\n📍 ${data.city}, ${data.regionName}, ${data.country} ${data.zip || ""}\n🕐 ${data.timezone || "?"}\n🌐 ISP: ${data.isp || "?"}${data.org ? ` (${data.org})` : ""}\n🗺️ Coordonnées: ${data.lat}, ${data.lon}`;
  } catch {
    return null;
  }
}

export async function fetchSunriseSunset(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("lever du soleil") &&
    !lower.includes("coucher du soleil") &&
    !lower.includes("sunrise") &&
    !lower.includes("sunset") &&
    !lower.includes("lever soleil") &&
    !lower.includes("coucher soleil")
  )
    return null;

  const cityMatch = lower.match(/(?:à|at|de|of|for)\s+([\w\s]+)/);
  const city = cityMatch ? cityMatch[1].trim() : "Paris";

  const cityCoords: Record<string, { lat: number; lng: number }> = {
    paris: { lat: 48.8566, lng: 2.3522 },
    london: { lat: 51.5074, lng: -0.1278 },
    "new york": { lat: 40.7128, lng: -74.006 },
    tokyo: { lat: 35.6762, lng: 139.6503 },
    sydney: { lat: -33.8688, lng: 151.2093 },
    berlin: { lat: 52.52, lng: 13.405 },
    moscow: { lat: 55.7558, lng: 37.6173 },
    dubai: { lat: 25.2048, lng: 55.2708 },
  };
  const coords = cityCoords[city.toLowerCase()] || cityCoords["paris"];

  try {
    const url = `https://api.sunrise-sunset.org/json?lat=${coords.lat}&lng=${coords.lng}&formatted=0`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { sunrise?: string; sunset?: string; solar_noon?: string; day_length?: string };
    };
    const r = data.results;
    if (!r) return null;
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `🌅 **Lever/Coucher du soleil — ${city}**\n\n🌅 Lever: ${r.sunrise ? fmt(r.sunrise) : "N/A"}\n🌇 Coucher: ${r.sunset ? fmt(r.sunset) : "N/A"}\n☀️ Midi solaire: ${r.solar_noon ? fmt(r.solar_noon) : "N/A"}\n⏱️ Durée du jour: ${r.day_length || "N/A"}`;
  } catch {
    return null;
  }
}

export async function fetchAirQuality(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("qualité de l'air") &&
    !lower.includes("qualite de l'air") &&
    !lower.includes("air quality") &&
    !lower.includes("pollution")
  )
    return null;

  const cityMatch = lower.match(/(?:à|at|de|of|for|en|in)\s+([\w\s]+)/);
  const city = cityMatch ? cityMatch[1].trim() : "Paris";

  const cityCoords: Record<string, { lat: number; lng: number }> = {
    paris: { lat: 48.8566, lng: 2.3522 },
    london: { lat: 51.5074, lng: -0.1278 },
    "new york": { lat: 40.7128, lng: -74.006 },
    tokyo: { lat: 35.6762, lng: 139.6503 },
    berlin: { lat: 52.52, lng: 13.405 },
    moscow: { lat: 55.7558, lng: 37.6173 },
  };
  const coords = cityCoords[city.toLowerCase()] || cityCoords["paris"];

  try {
    const url = `https://api.openaq.org/v2/latest?coordinates=${coords.lat},${coords.lng}&radius=25000&limit=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        location?: string;
        measurements?: Array<{ parameter?: string; value?: number; unit?: string }>;
      }>;
    };
    if (!data.results || data.results.length === 0) return null;
    const loc = data.results[0];
    const measurements =
      loc.measurements
        ?.map((m) => `**${m.parameter?.toUpperCase()}**: ${m.value} ${m.unit}`)
        .join("\n") || "N/A";
    return `🌫️ **Qualité de l'air — ${city}** (${loc.location || "N/A"})\n\n${measurements}`;
  } catch {
    return null;
  }
}

export async function fetchHolidays(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/jour f[ée]ri[ée]|holiday|feri[ée]/)) return null;

  const yearMatch = lower.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
  const countryCode = "FR";

  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      date?: string;
      localName?: string;
      name?: string;
    }>;
    if (!data || data.length === 0) return null;
    const lines = data.map((h) => `📅 ${h.date} — ${h.localName} (${h.name})`);
    return `🎉 **Jours fériés ${countryCode} ${year}:**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// ── OpenSky Network — Flight Tracker (gratuit, pas de clé API) ──────────────

export async function fetchOpenSkyFlights(query: string): Promise<string | null> {
  const lower = query.toLowerCase();

  // Trigger patterns: flight tracking, avion, vol, plane, aircraft
  if (
    !lower.match(
      /vol en cours|flight track|avion au[- ]?dessus|plane over|aircraft|flight status|suivi.*vol|track.*flight|avion.*près|flights? near|vols? au[- ]?dessus/,
    )
  )
    return null;

  // Mode 1: Track by callsign (e.g. "AFR123") — OpenSky doesn't support callsign filter,
  // so we fetch all states and filter client-side
  const callsignMatch = lower.match(/(?:vol|flight|track)\s+([A-Z]{3}\d{1,4}|[A-Z]{2}\d{2,4})/i);
  if (callsignMatch) {
    const callsign = callsignMatch[1].toUpperCase().trim();
    try {
      const res = await fetch(
        `https://opensky-network.org/api/states/all`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        time?: number;
        states?: Array<Array<any>>;
      };
      const states = data.states;
      if (!states || states.length === 0)
        return `✈️ **Vol ${callsign}** — Aucun vol actif trouvé.`;

      // Filter by callsign (index 1 in OpenSky state array)
      const matched = states.filter(
        (s) => String(s[1] || "").trim().toUpperCase() === callsign,
      );
      if (matched.length === 0)
        return `✈️ **Vol ${callsign}** — Vol non trouvé parmi les ${states.length} vols actifs.`;

      const s = matched[0];
      const cs = String(s[1] || "").trim() || "N/A";
      const origin = String(s[2] || "?");
      const lon = s[5] as number | null;
      const lat = s[6] as number | null;
      const alt = s[7] as number | null;
      const vel = s[9] as number | null;
      const heading = s[10] as number | null;
      const onGround = s[8] as boolean;

      const coords = lat !== null && lon !== null ? `${lat.toFixed(2)}, ${lon.toFixed(2)}` : "N/A";
      const altStr = alt !== null ? `${alt.toFixed(0)} m` : "N/A";
      const velStr = vel !== null ? `${vel.toFixed(0)} m/s (${(vel * 3.6).toFixed(0)} km/h)` : "N/A";
      const hdgStr = heading !== null ? `${heading.toFixed(0)}°` : "N/A";

      return `✈️ **Vol ${cs}** (origine: ${origin})\n\n📍 Position: ${coords}\n${onGround ? "🛬 Au sol" : `🛩️ Altitude: ${altStr}`}\n💨 Vitesse: ${velStr}\n🧭 Cap: ${hdgStr}`;
    } catch {
      return null;
    }
  }

  // Mode 2: Flights near a city/region (bounding box)
  const cityMatch = lower.match(/(?:au[- ]?dessus de|près de|near|over|above)\s+([\w\s]+)/);
  const city = cityMatch ? cityMatch[1].trim().toLowerCase() : null;

  // Predefined bounding boxes [lamin, lomin, lamax, lomax]
  const bboxes: Record<string, [number, number, number, number]> = {
    paris: [48.5, 1.8, 49.2, 2.6],
    london: [51.2, -0.5, 51.7, 0.3],
    "new york": [40.4, -74.3, 41.0, -73.5],
    tokyo: [35.4, 139.4, 35.9, 140.1],
    berlin: [52.3, 13.0, 52.7, 13.8],
    moscow: [55.4, 37.2, 56.0, 38.0],
    dubai: [24.8, 55.1, 25.4, 55.6],
    france: [41.0, -5.5, 51.5, 10.0],
    europe: [35.0, -10.0, 60.0, 30.0],
    "los angeles": [33.7, -118.7, 34.4, -117.8],
    sydney: [-34.1, 150.8, -33.6, 151.4],
  };

  const bbox = city ? bboxes[city] : null;

  try {
    let url: string;
    if (bbox) {
      url = `https://opensky-network.org/api/states/all?lamin=${bbox[0]}&lomin=${bbox[1]}&lamax=${bbox[2]}&lomax=${bbox[3]}`;
    } else {
      // Default: show all flights (limited by API)
      url = `https://opensky-network.org/api/states/all`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      time?: number;
      states?: Array<Array<any>>;
    };
    const states = data.states;
    if (!states || states.length === 0)
      return `✈️ **Aucun vol trouvé**${city ? ` près de ${city}` : ""}.`;

    // Limit to 10 results
    const limited = states.slice(0, 10);
    const lines = limited.map((s) => {
      const cs = String(s[1] || "").trim() || "N/A";
      const origin = String(s[2] || "?");
      const alt = s[7] as number | null;
      const vel = s[9] as number | null;
      const onGround = s[8] as boolean;
      const lat = s[6] as number | null;
      const lon = s[5] as number | null;
      const pos = lat !== null && lon !== null ? `${lat.toFixed(2)},${lon.toFixed(2)}` : "?";
      return `✈️ **${cs}** (${origin}) — ${onGround ? "🛬 Sol" : `🛩️ ${alt?.toFixed(0) || "?"}m`} | 💨 ${vel ? (vel * 3.6).toFixed(0) : "?"}km/h | 📍 ${pos}`;
    });

    const total = states.length;
    return `✈️ **Vols en temps réel${city ? ` — ${city}` : ""}** (${total} au total, ${limited.length} affichés)\n\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}
