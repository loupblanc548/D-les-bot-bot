/**
 * geoToolkit.ts — Geography & Cartography utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import https from "https";

function fetchJson(url: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout, headers: { "User-Agent": "QuantBot/1.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── Geocode reverse ────────────────────────────────────────────────────────
export async function geocodeReverse(lat: number, lon: number): Promise<string> {
  try {
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`,
    );
    return JSON.stringify(
      {
        coordinates: `${lat}, ${lon}`,
        address: data.display_name,
        city: data.address?.city,
        country: data.address?.country,
        postcode: data.address?.postcode,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Timezone convert advanced ──────────────────────────────────────────────
export function timezoneConvertAdvanced(datetime: string, fromTz: string, toTz: string): string {
  try {
    const date = new Date(datetime);
    const options1: Intl.DateTimeFormatOptions = {
      timeZone: fromTz,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const options2: Intl.DateTimeFormatOptions = {
      timeZone: toTz,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    return `${date.toLocaleString("en-US", options1)} (${fromTz})\n= ${date.toLocaleString("en-US", options2)} (${toTz})`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Distance matrix ─────────────────────────────────────────────────────────
export async function distanceMatrix(origins: string, destinations: string): Promise<string> {
  return `Distance matrix:\n  Origins: ${origins}\n  Destinations: ${destinations}\n\n  Use Google Maps Distance Matrix API (requires API key) or OSRM API:\n  https://router.project-osrm.org/route/v1/driving/${origins};${destinations}?overview=false`;
}

// ─── Elevation lookup ───────────────────────────────────────────────────────
export async function elevationLookup(lat: number, lon: number): Promise<string> {
  try {
    const data = await fetchJson(
      `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`,
    );
    if (data?.results?.[0])
      return `Elevation at ${lat}, ${lon}: ${data.results[0].elevation} meters`;
    return "Could not fetch elevation";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Country bordering ──────────────────────────────────────────────────────
export async function countryBordering(country: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=borders,name`,
    );
    if (!Array.isArray(data) || !data[0]) return "Country not found";
    const borders = data[0].borders || [];
    return JSON.stringify({ country: data[0].name?.common, borderingCountries: borders }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Currency by country ────────────────────────────────────────────────────
export async function currencyByCountry(country: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=currencies,name`,
    );
    if (!Array.isArray(data) || !data[0]) return "Country not found";
    const currencies = data[0].currencies || {};
    const result = Object.entries(currencies).map(([code, info]: [string, any]) => ({
      code,
      name: info.name,
      symbol: info.symbol,
    }));
    return JSON.stringify({ country: data[0].name?.common, currencies: result }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Language by country ────────────────────────────────────────────────────
export async function languageByCountry(country: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=languages,name`,
    );
    if (!Array.isArray(data) || !data[0]) return "Country not found";
    const languages = data[0].languages || {};
    return JSON.stringify(
      {
        country: data[0].name?.common,
        languages: Object.entries(languages).map(([code, name]) => ({ code, name })),
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Capital lookup ─────────────────────────────────────────────────────────
export async function capitalLookup(country: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=capital,name,population,area`,
    );
    if (!Array.isArray(data) || !data[0]) return "Country not found";
    return JSON.stringify(
      {
        country: data[0].name?.common,
        capital: data[0].capital?.[0] || "N/A",
        population: data[0].population,
        area: data[0].area,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── ISO country code ───────────────────────────────────────────────────────
export async function isoCountryCode(country: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=cca2,cca3,ccn3,name`,
    );
    if (!Array.isArray(data) || !data[0]) return "Country not found";
    return JSON.stringify(
      {
        country: data[0].name?.common,
        alpha2: data[0].cca2,
        alpha3: data[0].cca3,
        numeric: data[0].ccn3,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Sunrise/sunset anywhere ────────────────────────────────────────────────
export async function sunriseSunsetAnywhere(
  lat: number,
  lon: number,
  date: string,
): Promise<string> {
  try {
    const d = date || new Date().toISOString().slice(0, 10);
    const data = await fetchJson(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${d}&formatted=0`,
    );
    if (data?.status === "OK" && data.results) {
      return JSON.stringify(
        {
          date: d,
          location: `${lat}, ${lon}`,
          sunrise: data.results.sunrise,
          sunset: data.results.sunset,
          solarNoon: data.results.solar_noon,
          dayLength: data.results.day_length,
          twilight: {
            civil: `${data.results.civil_twilight_begin} - ${data.results.civil_twilight_end}`,
            astronomical: `${data.results.astronomical_twilight_begin} - ${data.results.astronomical_twilight_end}`,
          },
        },
        null,
        2,
      );
    }
    return "Could not fetch sunrise/sunset data";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
