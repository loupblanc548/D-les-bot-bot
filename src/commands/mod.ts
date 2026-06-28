import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Client,
} from "discord.js";
import { handleCommand as handleModeration } from "./moderation.js";
import { handleCommand as handleModExtra } from "./modExtra.js";
import { handleCommand as handleModPro } from "./moderationPro.js";
import { handleModExtra as handleModStub } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Commandes de modération (ban, kick, mute, warn, clear, etc.)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    // ── Sanctions ──
    .addSubcommand((sc) =>
      sc
        .setName("warn")
        .setDescription("Avertir un membre")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à avertir").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison de l'avertissement").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("mute")
        .setDescription("Rendre muet un membre (timeout Discord, longue durée)")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à mute").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("duree")
            .setDescription("Durée en minutes (max 40320 = 28 jours)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison du mute").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("unmute")
        .setDescription("Retirer le timeout d'un membre")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à unmute").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("kick")
        .setDescription("Expulser un membre du serveur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à expulser").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison de l'expulsion").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ban")
        .setDescription("Bannir un membre du serveur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à bannir").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("jours")
            .setDescription("Jours de messages à supprimer (1-7, défaut: 7)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(7),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison du bannissement").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("timeout")
        .setDescription("Mettre un membre en timeout (court terme, secondes)")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à timeout").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("duree")
            .setDescription("Durée en secondes (max 3600 = 1h)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(3600),
        ),
    )
    // ── Salon ──
    .addSubcommand((sc) =>
      sc
        .setName("clear")
        .setDescription("Supprimer un lot de messages dans le salon")
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre de messages à supprimer (1-100)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )
    .addSubcommand((sc) => sc.setName("unlock").setDescription("Déverrouiller le salon"))
    .addSubcommand((sc) =>
      sc
        .setName("purge")
        .setDescription("Supprime les messages d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("L'utilisateur cible").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre de messages à supprimer (1-100)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )
    // ── Utilitaires ──
    .addSubcommand((sc) =>
      sc
        .setName("history")
        .setDescription("Affiche l'historique des messages récents d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("L'utilisateur cible").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre de messages à afficher (1-50)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("slowmode")
        .setDescription("Slowmode du salon")
        .addIntegerOption((o) =>
          o
            .setName("duree")
            .setDescription("Durée en secondes (0-21600)")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(21600),
        ),
    )
    .addSubcommand((sc) => sc.setName("lock").setDescription("Verrouiller le salon"))
    .addSubcommand((sc) =>
      sc
        .setName("softban")
        .setDescription("Soft ban (ban+unban)")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true))
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("tempban")
        .setDescription("Ban temporaire")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true))
        .addIntegerOption((o) =>
          o.setName("duree").setDescription("Durée en minutes").setRequired(true).setMinValue(1),
        )
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("purgeuser")
        .setDescription("Supprime tous les messages d'un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc.setName("snipe").setDescription("Affiche le dernier message supprimé"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("report")
        .setDescription("Signale un membre au staff")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à signaler").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("raison").setDescription("Raison du signalement").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("mass-move")
        .setDescription("Déplace tous les membres vocaux vers un autre salon")
        .addChannelOption((o) =>
          o.setName("destination").setDescription("Salon vocal de destination").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("voice-kick")
        .setDescription("Expulse un membre du vocal")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à expulser").setRequired(true),
        ),
    )
    // ─── Nouvelles sous-commandes modération ───
    .addSubcommand((sc) =>
      sc
        .setName("unban")
        .setDescription("Révoque un ban")
        .addStringOption((o) => o.setName("id").setDescription("ID Discord").setRequired(true))
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ban-all")
        .setDescription("Ban en masse depuis une liste d'IDs")
        .addStringOption((o) => o.setName("ids").setDescription("IDs séparés par virgule/espace").setRequired(true))
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc.setName("mass-unban").setDescription("Révoque tous les bans du serveur"),
    )
    .addSubcommand((sc) => sc.setName("mute-list").setDescription("Liste des membres actuellement mute"))
    .addSubcommand((sc) =>
      sc
        .setName("warn-list")
        .setDescription("Liste les warns d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("warn-remove")
        .setDescription("Supprime un warn spécifique")
        .addIntegerOption((o) => o.setName("id").setDescription("ID du warn").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("warn-reset")
        .setDescription("Réinitialise tous les warns d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("lockdown")
        .setDescription("Verrouille tous les salons du serveur")
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("unlock-all").setDescription("Déverrouille tous les salons")),
    .addSubcommand((sc) => sc.setName("dehoist").setDescription("Retire les caractères spéciaux des pseudos")),
    .addSubcommand((sc) =>
      sc
        .setName("nickname-force")
        .setDescription("Force un pseudo à un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true))
        .addStringOption((o) => o.setName("pseudo").setDescription("Nouveau pseudo").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("nickname-reset")
        .setDescription("Réinitialise le pseudo d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("inrole")
        .setDescription("Liste les membres ayant un rôle")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-all")
        .setDescription("Donne un rôle à tous les membres")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-remove-all")
        .setDescription("Retire un rôle à tous les membres")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true)),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "report") {
    await handleModExtra(interaction, client);
  } else if (action === "mass-move" || action === "voice-kick") {
    await handleModPro(interaction);
  } else {
    // Try existing handlers first, then stub
    const existingSubs = ["warn","mute","unmute","kick","ban","timeout","clear","unlock","purge","history","slowmode","lock","softban","tempban","purgeuser","snipe"];
    if (existingSubs.includes(action)) {
      await handleModeration(interaction, client);
    } else {
      await handleModStub(interaction, client);
    }
  }
}
