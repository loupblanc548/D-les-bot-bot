/**
 * clientRef.ts — Global Discord client reference.
 *
 * Provides access to the Discord client for services that can't
 * receive it via constructor injection (e.g. task worker handlers).
 */

import type { Client } from "discord.js";

let clientRef: Client | null = null;

export function setClient(client: Client): void {
  clientRef = client;
}

export function getClient(): Client | null {
  return clientRef;
}
