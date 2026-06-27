import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { handleCommand as handleAdmin } from "./admin.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";

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
    .toJSON(),
];

const NAME_MAP: Record<string, string> = {
  add: "add-source",
  remove: "remove-source",
  list: "list-sources",
  pause: "pause-source",
  "reddit-track": "reddit-track",
  "rss-custom": "rss-custom",
};

const EXTRA_CMDS = ["reddit-track", "rss-custom"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const action = interaction.options.getSubcommand();
  const mappedName = NAME_MAP[action] || action;
  Object.defineProperty(interaction, "commandName", { value: mappedName, writable: true });

  if (EXTRA_CMDS.includes(action)) {
    await handleExtraCmd(interaction, client as import("discord.js").Client);
  } else {
    await handleAdmin(interaction);
  }
}
