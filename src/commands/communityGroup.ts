import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleCommand as handleCommunity } from "./community.js";
import { handleCommand as handleCommunityExtra } from "./communityExtra.js";
import { handleCommand as handleProfile } from "./profile.js";
import { handleCommunityExtraCmd } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("community")
    .setDescription("Fonctionnalités communautaires")
    .addSubcommand((sc) =>
      sc.setName("ticket-setup").setDescription("Configure le système de tickets"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("self-role")
        .setDescription("Rôles auto-attribuables (admin)")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("profile")
        .setDescription("Profil personnalisé (bio, couleur, badges, titre)")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
    )
    // ─── Nouvelles sous-commandes communauté ───
    .addSubcommand((sc) =>
      sc
        .setName("poll")
        .setDescription("Créer un sondage interactif")
        .addStringOption((o) => o.setName("question").setDescription("La question").setRequired(true))
        .addStringOption((o) => o.setName("options").setDescription("Options séparées par virgules (max 10)").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("giveaway")
        .setDescription("Organiser un giveaway")
        .addStringOption((o) => o.setName("duree").setDescription("Durée (ex: 1h, 24h)").setRequired(true))
        .addStringOption((o) => o.setName("prix").setDescription("Prix à gagner").setRequired(true))
        .addIntegerOption((o) => o.setName("gagnants").setDescription("Nombre de gagnants").setRequired(false).setMinValue(1).setMaxValue(20)),
    )
    .addSubcommand((sc) => sc.setName("giveaway-list").setDescription("Liste des giveaways actifs"))
    .addSubcommand((sc) =>
      sc
        .setName("giveaway-reroll")
        .setDescription("Re-tirer un gagnant")
        .addStringOption((o) => o.setName("message_id").setDescription("ID du message").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("reaction-roles").setDescription("Configurer les rôles par réaction"))
    .addSubcommand((sc) => sc.setName("welcome-config").setDescription("Configurer le message de bienvenue"))
    .addSubcommand((sc) => sc.setName("goodbye-config").setDescription("Configurer le message de départ"))
    .addSubcommand((sc) =>
      sc
        .setName("birthday-set")
        .setDescription("Définir ton anniversaire")
        .addStringOption((o) => o.setName("date").setDescription("Date (JJ/MM)").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("birthday-list").setDescription("Liste des anniversaires à venir"))
    .addSubcommand((sc) => sc.setName("birthday-config").setDescription("Configure le salon/role d'anniversaire (admin)"))
    .addSubcommand((sc) => sc.setName("level-config").setDescription("Configuration du système de niveaux"))
    .addSubcommand((sc) =>
      sc
        .setName("rank")
        .setDescription("Affiche ton niveau et XP")
        .addUserOption((o) => o.setName("cible").setDescription("Voir le rang d'un autre").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("leaderboard").setDescription("Classement XP du serveur"))
    .addSubcommand((sc) =>
      sc
        .setName("lfg")
        .setDescription("Looking For Group — trouver des coéquipiers")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true))
        .addIntegerOption((o) => o.setName("nombre").setDescription("Nombre de joueurs").setRequired(false).setMinValue(1).setMaxValue(20))
        .addStringOption((o) => o.setName("duree").setDescription("Durée de la session").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("lfg-list").setDescription("Liste des groupes LFG actifs"))
    .addSubcommand((sc) => sc.setName("server-info").setDescription("Infos détaillées du serveur"))
    .addSubcommand((sc) =>
      sc
        .setName("avatar")
        .setDescription("Afficher l'avatar d'un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("role-info")
        .setDescription("Infos sur un rôle")
        .addRoleOption((o) => o.setName("rôle").setDescription("Le rôle").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("channel-info")
        .setDescription("Infos sur un salon")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("member-count").setDescription("Compteur de membres en temps réel"))
    .addSubcommand((sc) => sc.setName("server-boost").setDescription("Infos sur les boosts du serveur"))
    .addSubcommand((sc) =>
      sc
        .setName("color")
        .setDescription("Définir ta couleur de profil")
        .addStringOption((o) => o.setName("hex").setDescription("Couleur HEX (ex: #ff5733)").setRequired(true)),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "ticket-setup") {
    await handleCommunity(interaction, dc);
  } else if (action === "self-role") {
    await handleCommunityExtra(interaction, dc);
  } else if (action === "profile") {
    await handleProfile(interaction);
  } else {
    await handleCommunityExtraCmd(interaction, dc);
  }
}
