import { EmbedBuilder, type Client, type Message } from "discord.js";
import { presentFichesFromTool } from "./discordFiche.js";

export interface NetworkDefenseItem {
  id: string;
  name: string;
  attacker: string;
  defend: string;
}

export const NETWORK_DEFENSE_ITEMS: NetworkDefenseItem[] = [
  {
    id: "nmap",
    name: "Nmap",
    attacker: "Cartographie les ports et services exposés.",
    defend:
      "Ferme tout ce qui n’est pas utile, pare-feu devant, admin hors Internet public, journaux de connexions.",
  },
  {
    id: "hydra",
    name: "Hydra",
    attacker: "Essaie des identifiants en masse (SSH, FTP, web…).",
    defend:
      "MFA, verrouillage après échecs, mots de passe uniques, SSH par clé plutôt que mot de passe.",
  },
  {
    id: "ettercap",
    name: "Ettercap",
    attacker: "Intercepte le trafic sur un réseau local (MITM).",
    defend: "HTTPS/TLS partout, ne pas faire confiance au Wi-Fi/LAN, VPN sur les réseaux inconnus.",
  },
  {
    id: "hashcat",
    name: "Hashcat",
    attacker: "Casse des hashes volés (mots de passe stockés trop faibles).",
    defend:
      "Phrases de passe longues et uniques, gestionnaire de mots de passe, jamais de hash non salé.",
  },
  {
    id: "metasploit",
    name: "Metasploit",
    attacker: "Enchaîne des failles déjà connues sur des services non patchés.",
    defend: "Mises à jour rapides, moins de services, comptes avec le moins de droits possible.",
  },
  {
    id: "wifite",
    name: "Wifite",
    attacker: "Cherche un Wi-Fi mal configuré (WPS, vieux chiffrement, mot de passe faible).",
    defend: "WPA3 si possible, WPS désactivé, phrase longue, réseau invité, admin routeur changé.",
  },
  {
    id: "searchsploit",
    name: "SearchSploit",
    attacker: "Trouve un exploit public pour une version précise d’un logiciel.",
    defend:
      "Inventaire des versions, patches, scan de dépendances (genre Trivy) sur ce que tu sers.",
  },
];

export function findNetworkDefenseItem(query?: string | null): NetworkDefenseItem | undefined {
  if (!query) return undefined;
  const key = query.trim().toLowerCase();
  if (!key) return undefined;
  return NETWORK_DEFENSE_ITEMS.find((item) => item.id === key || item.name.toLowerCase() === key);
}

export function formatNetworkDefenseForAgent(item?: NetworkDefenseItem): string {
  const rows = item ? [item] : NETWORK_DEFENSE_ITEMS;
  const lines = rows.map(
    (row) => `**${row.name}** — menace : ${row.attacker} Parade : ${row.defend}`,
  );
  return [
    "**Fiche défense réseau** (pas d’outils d’attaque).",
    ...lines,
    "Réponds en français, sans commandes Kali ni tableau markdown | col |.",
  ].join("\n");
}

export function buildNetworkDefenseEmbeds(filter?: NetworkDefenseItem): EmbedBuilder[] {
  const items = filter ? [filter] : NETWORK_DEFENSE_ITEMS;
  const header = new EmbedBuilder()
    .setColor(0x3ba55d)
    .setTitle("Défense réseau")
    .setDescription(
      filter
        ? `Parade contre **${filter.name}** — rien n’est lancé, c’est de la prévention.`
        : `**${items.length} menaces** fréquentes (scan, brute-force, Wi-Fi, exploits).\nRien n’est exécuté : uniquement comment se protéger.`,
    )
    .setFooter({ text: "Défense · pas d’attaque" })
    .setTimestamp();

  const cards = items.map((item) =>
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(item.name)
      .addFields(
        { name: "Ce que ça vise", value: item.attacker },
        { name: "Comment se protéger", value: item.defend },
      ),
  );
  return [header, ...cards];
}

export async function presentNetworkDefenseFromTool(
  ctx: { client: Client; message?: Message; channelId?: string },
  filter?: NetworkDefenseItem,
): Promise<boolean> {
  return presentFichesFromTool(ctx, buildNetworkDefenseEmbeds(filter));
}
