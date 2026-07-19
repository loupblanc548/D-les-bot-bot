/**
 * googleCalendar.ts — Google Calendar Integration for Server Events
 *
 * Uses Google Calendar API with a service account or OAuth credentials.
 * Reads from and writes to a shared server calendar (not personal).
 *
 * Env vars:
 *  - GOOGLE_CALENDAR_ID: calendar ID (e.g. bot-events@group.calendar.google.com)
 *  - GOOGLE_CALENDAR_CREDENTIALS_JSON: path to service account JSON file
 *
 * Degrades gracefully if not configured — tools return null and are filtered.
 */

import { google, type calendar_v3 } from "googleapis";
import { readFile } from "fs/promises";
import logger from "../utils/logger.js";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "";
const CREDENTIALS_PATH = process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON ?? "";

let calendarClient: calendar_v3.Calendar | null = null;
let authClient: GoogleAuth | null = null;

interface GoogleAuth {
  getClient(): Promise<unknown>;
}

async function getCalendarClient(): Promise<calendar_v3.Calendar | null> {
  if (calendarClient) return calendarClient;
  if (!CALENDAR_ID || !CREDENTIALS_PATH) {
    logger.debug(
      "[GoogleCalendar] Not configured — missing GOOGLE_CALENDAR_ID or GOOGLE_CALENDAR_CREDENTIALS_JSON",
    );
    return null;
  }

  try {
    const content = await readFile(CREDENTIALS_PATH, "utf-8");
    const credentials = JSON.parse(content);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    const client = await auth.getClient();
    calendarClient = google.calendar({
      version: "v3",
      auth: client as unknown as string,
    });
    authClient = auth as unknown as GoogleAuth;
    logger.info("[GoogleCalendar] Client initialized successfully");
    return calendarClient;
  } catch (err) {
    logger.warn(
      `[GoogleCalendar] Failed to initialize: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
}

export async function listUpcomingEvents(maxResults = 10): Promise<CalendarEvent[] | null> {
  const cal = await getCalendarClient();
  if (!cal) return null;

  try {
    const res = await cal.events.list({
      calendarId: CALENDAR_ID,
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: new Date().toISOString(),
    });

    const events = res.data.items ?? [];
    return events.map((e) => ({
      id: e.id ?? "",
      summary: e.summary ?? "(sans titre)",
      description: e.description ?? undefined,
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      location: e.location ?? undefined,
    }));
  } catch (err) {
    logger.warn(
      `[GoogleCalendar] listUpcomingEvents error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function createCalendarEvent(params: {
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
}): Promise<CalendarEvent | null> {
  const cal = await getCalendarClient();
  if (!cal) return null;

  try {
    const res = await cal.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
        location: params.location,
      },
    });

    const e = res.data;
    return {
      id: e.id ?? "",
      summary: e.summary ?? params.summary,
      description: e.description ?? undefined,
      start: e.start?.dateTime ?? params.start,
      end: e.end?.dateTime ?? params.end,
      location: e.location ?? undefined,
    };
  } catch (err) {
    logger.warn(
      `[GoogleCalendar] createCalendarEvent error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export function isCalendarConfigured(): boolean {
  return !!CALENDAR_ID && !!CREDENTIALS_PATH;
}
