import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { handleCommand as handleAdmin } from "./admin.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";
import { handleCommand as handleAdvanced } from "./advanced.js";
import { handleCommand as handleMaintenance } from "./maintenance.js";

import { handleSourcesExtra } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("sources")
    .setDescription("Gestion des sources de surveillance (Twitter, YouTube, Reddit, RSS)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Ajouter une nouvelle source de surveillance")
        .addStringOption((o) =>
          o.setName("handle").setDescription("Handle ou URL").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type de source")
            .setRequired(true)
            .addChoices(
              { name: "Twitter/X", value: "TWITTER" },
              { name: "YouTube", value: "YOUTUBE" },
              { name: "YouTube (notifications uniquement)", value: "YOUTUBE_ONLY" },
              { name: "Reddit", value: "REDDIT" },
              { name: "RSS", value: "RSS" },
            ),
        )
        .addChannelOption((o) =>
          o.setName("salon").setDescription("Salon de notification").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Supprimer une source de surveillance")
        .addStringOption((o) =>
          o.setName("handle").setDescription("Handle de la source à supprimer").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("list").setDescription("Lister toutes les sources configurées"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("pause")
        .setDescription("Mettre en pause une source de surveillance")
        .addStringOption((o) =>
          o.setName("handle").setDescription("Handle de la source").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("reddit-track")
        .setDescription("Suit un subreddit et notifie les posts populaires")
        .addStringOption((o) =>
          o.setName("subreddit").setDescription("Nom du subreddit (sans r/)").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("rss-custom")
        .setDescription("Ajoute un flux RSS personnalisé")
        .addStringOption((o) =>
          o.setName("url").setDescription("URL du flux RSS").setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("stats").setDescription("Statistiques des sources"))
    .addSubcommand((sc) =>
      sc
        .setName("rss-test")
        .setDescription("Teste un flux RSS")
        .addStringOption((o) => o.setName("url").setDescription("URL du flux").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("scraper-status").setDescription("Statut des scrapers"))
    .addSubcommand((sc) =>
      sc
        .setName("search-notifications")
        .setDescription("Recherche dans les notifications")
        .addStringOption((o) =>
          o.setName("requete").setDescription("Requête de recherche").setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("test-freegames").setDescription("Teste les jeux gratuits"))
    .addSubcommand((sc) =>
      sc
        .setName("test-rss")
        .setDescription("Teste un flux RSS")
        .addStringOption((o) => o.setName("url").setDescription("URL du flux").setRequired(true)),
    )
    // ─── Nouvelles sous-commandes sources ───
    .addSubcommand((sc) =>
      sc
        .setName("source-edit")
        .setDescription("Modifier une source existante")
        .addStringOption((o) => o.setName("handle").setDescription("Handle de la source").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("source-test")
        .setDescription("Tester une source")
        .addStringOption((o) => o.setName("handle").setDescription("Handle de la source").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("source-logs").setDescription("Logs des sources"))
    .addSubcommand((sc) => sc.setName("source-pause-all").setDescription("Mettre toutes les sources en pause"))
    .addSubcommand((sc) => sc.setName("source-resume-all").setDescription("Reprendre toutes les sources"))
    .addSubcommand((sc) => sc.setName("source-health").setDescription("Sant\u00e9 des sources (uptime, erreurs)"))
    .addSubcommand((sc) => sc.setName("source-export").setDescription("Exporter la configuration des sources"))
    .addSubcommand((sc) =>
      sc
        .setName("source-import")
        .setDescription("Importer une configuration de sources")
        .addStringOption((o) => o.setName("json").setDescription("Configuration JSON").setRequired(true)),
    )
    .toJSON(),
];

const NAME_MAP: Record<string, string> = {
  add: "add-source",
  remove: "remove-source",
  list: "list-sources",
  pause: "pause-source",
  "reddit-track": "reddit-track",
  "rss-custom": "rss-custom",
  stats: "source-stats",
  "rss-test": "rss-test",
  "scraper-status": "scraper-status",
  "search-notifications": "search-notifications",
  "test-freegames": "test-freegames",
  "test-rss": "test-rss",
};

const EXTRA_CMDS = ["reddit-track", "rss-custom"];
const ADVANCED_CMDS = ["stats", "rss-test", "scraper-status"];
const ADMIN_CMDS = ["search-notifications", "test-freegames"];
const MAINTENANCE_CMDS = ["test-rss"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const action = interaction.options.getSubcommand();
  const mappedName = NAME_MAP[action] || action;
  Object.defineProperty(interaction, "commandName", { value: mappedName, writable: true });
  const dc = client as import("discord.js").Client;

  if (EXTRA_CMDS.includes(action)) {
    await handleExtraCmd(interaction, dc);
  } else if (ADVANCED_CMDS.includes(action)) {
    await handleAdvanced(interaction, dc);
  } else if (ADMIN_CMDS.includes(action)) {
    await handleAdmin(interaction);
  } else if (MAINTENANCE_CMDS.includes(action)) {
    await handleMaintenance(interaction, dc);
  } else {
    // Try existing handlers, then stub
    const existingSubs = ["add","remove","list","pause"];
    if (existingSubs.includes(action)) {
      await handleAdmin(interaction);
    } else {
      await handleSourcesExtra(interaction, dc);
    }
  }
}
