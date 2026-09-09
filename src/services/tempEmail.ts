/**
 * tempEmail.ts — Email temporaire avec chaîne de fallback
 *
 * 1. Mail.tm (https://api.mail.tm) — API REST, nécessite un token de session
 * 2. 1secmail (https://www.1secmail.com/api/v1/) — fallback, pas d'auth
 *
 * Aucune clé API requise. Aucun paramètre utilisateur injecté dans l'URL
 * (les endpoints sont fixes, seul le login généré localement est utilisé).
 *
 * ⚠️ Avertissement confidentialité: une boîte mail temporaire n'est PAS privée.
 * Selon le fournisseur, toute personne connaissant l'adresse peut lire son contenu.
 */

import { randomInt } from "node:crypto";
import logger from "../utils/logger.js";

export interface TempEmailAccount {
  address: string;
  providerId: string;
  provider: "mail.tm" | "1secmail";
  token?: string;
  id?: string;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
}

const ADJECTIVES = ["swift", "calm", "brave", "clever", "quiet", "bold", "wise", "lucky"];
const NOUNS = ["tiger", "river", "stone", "eagle", "wolf", "star", "cloud", "falcon"];

function randomLocalPart(): string {
  const adj = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  const num = randomInt(1000, 99999);
  return `${adj}.${noun}${num}`;
}

// ─── Mail.tm ──────────────────────────────────────────────────────────────────

interface MailTmAccount {
  id: string;
  address: string;
}

interface MailTmTokenResponse {
  token: string;
  id: string;
}

async function createMailTm(): Promise<TempEmailAccount | null> {
  try {
    const domainsRes = await fetch("https://api.mail.tm/domains?page=1", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!domainsRes.ok) return null;

    const domainsData = (await domainsRes.json()) as {
      "hydra:member": Array<{ domain: string; isActive: boolean }>;
    };
    const activeDomains = domainsData["hydra:member"]?.filter((d) => d.isActive);
    if (!activeDomains || activeDomains.length === 0) return null;

    const domain = activeDomains[0].domain;
    const localPart = randomLocalPart();
    const address = `${localPart}@${domain}`;
    const password = randomLocalPart() + randomInt(1000, 99999).toString();

    const createRes = await fetch("https://api.mail.tm/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, password }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!createRes.ok) return null;
    const account = (await createRes.json()) as MailTmAccount;

    const tokenRes = await fetch("https://api.mail.tm/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, password }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenRes.ok) return null;
    const tokenData = (await tokenRes.json()) as MailTmTokenResponse;

    return {
      address,
      providerId: account.id,
      provider: "mail.tm",
      token: tokenData.token,
      id: account.id,
    };
  } catch (err) {
    logger.warn(`[TempEmail] Mail.tm failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function checkMailTmInbox(account: TempEmailAccount): Promise<EmailMessage[]> {
  if (!account.token) return [];

  try {
    const res = await fetch("https://api.mail.tm/messages?page=1", {
      headers: { Authorization: `Bearer ${account.token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      "hydra:member": Array<{
        id: string;
        from: { address: string; name: string };
        subject: string;
        createdAt: string;
        intro: string;
      }>;
    };

    const messages = data["hydra:member"] || [];
    const results: EmailMessage[] = [];

    for (const msg of messages.slice(0, 10)) {
      let body = msg.intro || "";
      try {
        const detailRes = await fetch(`https://api.mail.tm/messages/${msg.id}`, {
          headers: { Authorization: `Bearer ${account.token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as { text?: string; html?: string[] };
          body = detail.text || detail.html?.join(" ") || msg.intro || "";
        }
      } catch {
        logger.error("[Silent catch]");
      }

      results.push({
        id: msg.id,
        from: msg.from?.address || "unknown",
        subject: msg.subject || "(no subject)",
        body: body.slice(0, 2000),
        date: msg.createdAt || new Date().toISOString(),
      });
    }

    return results;
  } catch (err) {
    logger.warn(
      `[TempEmail] Mail.tm inbox failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ─── 1secmail ─────────────────────────────────────────────────────────────────

const ONESECMAIL_DOMAINS = ["1secmail.com", "1secmail.org", "1secmail.net", "wwjmp.com"];

async function create1secmail(): Promise<TempEmailAccount | null> {
  try {
    const domain = ONESECMAIL_DOMAINS[randomInt(ONESECMAIL_DOMAINS.length)];
    const localPart = randomLocalPart();
    const address = `${localPart}@${domain}`;

    return {
      address,
      providerId: address,
      provider: "1secmail",
    };
  } catch (err) {
    logger.warn(`[TempEmail] 1secmail failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function check1secmailInbox(account: TempEmailAccount): Promise<EmailMessage[]> {
  const [login, domain] = account.address.split("@");
  if (!login || !domain) return [];

  try {
    const res = await fetch(
      `https://www.1secmail.com/api/v1/?action=getMessages&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!res.ok) return [];

    const messages = (await res.json()) as Array<{
      id: number;
      from: string;
      subject: string;
      date: string;
    }>;

    const results: EmailMessage[] = [];

    for (const msg of messages.slice(0, 10)) {
      let body = "";
      try {
        const bodyRes = await fetch(
          `https://www.1secmail.com/api/v1/?action=readMessage&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${msg.id}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (bodyRes.ok) {
          const bodyData = (await bodyRes.json()) as { body?: string; textBody?: string };
          body = bodyData.textBody || bodyData.body || "";
        }
      } catch {
        logger.error("[Silent catch]");
      }

      results.push({
        id: String(msg.id),
        from: msg.from || "unknown",
        subject: msg.subject || "(no subject)",
        body: body.slice(0, 2000),
        date: msg.date || new Date().toISOString(),
      });
    }

    return results;
  } catch (err) {
    logger.warn(
      `[TempEmail] 1secmail inbox failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ─── API publique avec fallback ───────────────────────────────────────────────

export async function createTempEmail(): Promise<TempEmailAccount> {
  const mailTm = await createMailTm();
  if (mailTm) {
    logger.info(`[TempEmail] Created via Mail.tm: ${mailTm.address}`);
    return mailTm;
  }

  logger.info("[TempEmail] Mail.tm unavailable, falling back to 1secmail");
  const oneSec = await create1secmail();
  if (oneSec) {
    logger.info(`[TempEmail] Created via 1secmail: ${oneSec.address}`);
    return oneSec;
  }

  throw new Error("Aucun fournisseur d'email temporaire disponible");
}

export async function checkTempEmailInbox(account: TempEmailAccount): Promise<EmailMessage[]> {
  if (account.provider === "mail.tm") {
    return checkMailTmInbox(account);
  } else if (account.provider === "1secmail") {
    return check1secmailInbox(account);
  }
  return [];
}

export const PRIVACY_WARNING =
  "⚠️ **Confidentialité:** Une boîte mail temporaire n'est PAS privée. Selon le fournisseur, toute personne connaissant l'adresse peut potentiellement lire son contenu. N'utilise pas cette adresse pour des communications sensibles.";
