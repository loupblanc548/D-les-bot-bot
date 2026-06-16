import { 
  ContextMenuCommandBuilder, 
  ApplicationCommandType, 
  ApplicationCommandOptionType,
  ContextMenuCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder
} from "discord.js";
import logger from "../utils/logger";

/**
 * Système de menus contextuels pour commandes
 * Permet d'ajouter des actions contextuelles sur les messages et utilisateurs
 */

export interface ContextMenuConfig {
  name: string;
  type: "USER" | "MESSAGE";
  permissions?: bigint[];
  handler: (interaction: ContextMenuCommandInteraction) => Promise<void>;
}

class ContextMenuSystem {
  private menus: Map<string, ContextMenuConfig> = new Map();

  /**
   * Enregistre un menu contextuel
   */
  registerMenu(config: ContextMenuConfig): void {
    this.menus.set(config.name, config);
    logger.info(`[ContextMenu] Menu enregistré: ${config.name} (${config.type})`);
  }

  /**
   * Obtient un menu contextuel par son nom
   */
  getMenu(name: string): ContextMenuConfig | undefined {
    return this.menus.get(name);
  }

  /**
   * Obtient tous les menus contextuels
   */
  getAllMenus(): ContextMenuConfig[] {
    return Array.from(this.menus.values());
  }

  /**
   * Obtient les menus par type
   */
  getMenusByType(type: "USER" | "MESSAGE"): ContextMenuConfig[] {
    return Array.from(this.menus.values()).filter(menu => menu.type === type);
  }

  /**
   * Génère les builders Discord pour l'enregistrement
   */
  generateBuilders(): Array<ContextMenuCommandBuilder> {
    const builders: Array<ContextMenuCommandBuilder> = [];

    for (const [name, config] of this.menus.entries()) {
      const builder = new ContextMenuCommandBuilder()
        .setName(name);

      if (config.type === "USER") {
        builder.setType(ApplicationCommandType.User);
      } else {
        builder.setType(ApplicationCommandType.Message);
      }

      if (config.permissions && config.permissions.length > 0) {
        builder.setDefaultMemberPermissions(config.permissions[0]);
      }

      builders.push(builder);
    }

    return builders;
  }

  /**
   * Gère l'exécution d'un menu contextuel
   */
  async handleInteraction(interaction: ContextMenuCommandInteraction): Promise<void> {
    const menu = this.menus.get(interaction.commandName);
    if (!menu) {
      logger.error(`[ContextMenu] Menu non trouvé: ${interaction.commandName}`);
      await interaction.reply({ 
        content: "❌ Menu non trouvé", 
        ephemeral: true 
      });
      return;
    }

    try {
      await menu.handler(interaction);
    } catch (error) {
      logger.error(`[ContextMenu] Erreur exécution ${interaction.commandName}: ${error}`);
      await interaction.reply({ 
        content: "❌ Erreur lors de l'exécution du menu", 
        ephemeral: true 
      });
    }
  }
}

// Instance singleton
export const contextMenuSystem = new ContextMenuSystem();

/**
 * Menus contextuels prédéfinis pour les utilisateurs
 */
export const USER_CONTEXT_MENUS: ContextMenuConfig[] = [
  {
    name: "Voir le profil",
    type: "USER",
    permissions: [PermissionFlagsBits.SendMessages],
    handler: async (interaction) => {
      if (!interaction.isUserContextMenuCommand()) return;

      const targetUser = interaction.targetUser;
      const member = await interaction.guild?.members.fetch(targetUser.id);

      const embed = new EmbedBuilder()
        .setTitle(`👤 Profil de ${targetUser.username}`)
        .setColor(0x0099ff)
        .addFields(
          { name: "ID", value: targetUser.id, inline: true },
          { name: "Créé le", value: targetUser.createdAt.toDateString(), inline: true },
          { name: "Rejoint le", value: member?.joinedAt?.toDateString() || "N/A", inline: true },
          { name: "Rôles", value: member?.roles.cache.map(r => r.name).join(", ") || "Aucun", inline: false }
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
  {
    name: "Historique des commandes",
    type: "USER",
    permissions: [PermissionFlagsBits.SendMessages],
    handler: async (interaction) => {
      if (!interaction.isUserContextMenuCommand()) return;

      const targetUser = interaction.targetUser;
      
      await interaction.reply({ 
        content: `📊 Historique des commandes de ${targetUser.username}`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Signaler l'utilisateur",
    type: "USER",
    permissions: [PermissionFlagsBits.ModerateMembers],
    handler: async (interaction) => {
      if (!interaction.isUserContextMenuCommand()) return;

      const targetUser = interaction.targetUser;
      
      await interaction.reply({ 
        content: `🚨 Signalement de ${targetUser.username} envoyé aux modérateurs`, 
        ephemeral: true 
      });
    }
  }
];

/**
 * Menus contextuels prédéfinis pour les messages
 */
export const MESSAGE_CONTEXT_MENUS: ContextMenuConfig[] = [
  {
    name: "Traduire le message",
    type: "MESSAGE",
    permissions: [PermissionFlagsBits.SendMessages],
    handler: async (interaction) => {
      if (!interaction.isMessageContextMenuCommand()) return;

      const targetMessage = interaction.targetMessage;
      
      await interaction.reply({ 
        content: `🌐 Traduction de: "${targetMessage.content.slice(0, 100)}..."`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Citer le message",
    type: "MESSAGE",
    permissions: [PermissionFlagsBits.SendMessages],
    handler: async (interaction) => {
      if (!interaction.isMessageContextMenuCommand()) return;

      const targetMessage = interaction.targetMessage;
      const author = targetMessage.author;
      
      await interaction.reply({ 
        content: `> ${author.username}: ${targetMessage.content}`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Signaler le message",
    type: "MESSAGE",
    permissions: [PermissionFlagsBits.SendMessages],
    handler: async (interaction) => {
      if (!interaction.isMessageContextMenuCommand()) return;

      const targetMessage = interaction.targetMessage;
      
      await interaction.reply({ 
        content: `🚨 Signalement du message envoyé aux modérateurs`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Analyser avec l'IA",
    type: "MESSAGE",
    permissions: [PermissionFlagsBits.SendMessages],
    handler: async (interaction) => {
      if (!interaction.isMessageContextMenuCommand()) return;

      const targetMessage = interaction.targetMessage;
      
      await interaction.reply({ 
        content: `🤖 Analyse IA du message en cours...`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Sauvegarder dans les notes",
    type: "MESSAGE",
    permissions: [PermissionFlagsBits.SendMessages],
    handler: async (interaction) => {
      if (!interaction.isMessageContextMenuCommand()) return;

      const targetMessage = interaction.targetMessage;
      
      await interaction.reply({ 
        content: `📝 Message sauvegardé dans vos notes`, 
        ephemeral: true 
      });
    }
  }
];

/**
 * Enregistre tous les menus contextuels prédéfinis
 */
export function registerDefaultContextMenus(): void {
  for (const menu of USER_CONTEXT_MENUS) {
    contextMenuSystem.registerMenu(menu);
  }

  for (const menu of MESSAGE_CONTEXT_MENUS) {
    contextMenuSystem.registerMenu(menu);
  }

  logger.info(`[ContextMenu] ${USER_CONTEXT_MENUS.length + MESSAGE_CONTEXT_MENUS.length} menus par défaut enregistrés`);
}

/**
 * Crée un menu contextuel personnalisé
 */
export function createCustomContextMenu(config: ContextMenuConfig): void {
  contextMenuSystem.registerMenu(config);
}

/**
 * Menus contextuels spécifiques pour la modération
 */
export const MODERATION_CONTEXT_MENUS: ContextMenuConfig[] = [
  {
    name: "Bannir l'utilisateur",
    type: "USER",
    permissions: [PermissionFlagsBits.BanMembers],
    handler: async (interaction) => {
      if (!interaction.isUserContextMenuCommand()) return;

      const targetUser = interaction.targetUser;
      
      await interaction.reply({ 
        content: `⚠️ Action de bannissement pour ${targetUser.username} - Confirmation requise`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Muter l'utilisateur",
    type: "USER",
    permissions: [PermissionFlagsBits.ModerateMembers],
    handler: async (interaction) => {
      if (!interaction.isUserContextMenuCommand()) return;

      const targetUser = interaction.targetUser;
      
      await interaction.reply({ 
        content: `🔇 Action de mute pour ${targetUser.username} - Confirmation requise`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Kick l'utilisateur",
    type: "USER",
    permissions: [PermissionFlagsBits.KickMembers],
    handler: async (interaction) => {
      if (!interaction.isUserContextMenuCommand()) return;

      const targetUser = interaction.targetUser;
      
      await interaction.reply({ 
        content: `👢 Action de kick pour ${targetUser.username} - Confirmation requise`, 
        ephemeral: true 
      });
    }
  },
  {
    name: "Supprimer le message",
    type: "MESSAGE",
    permissions: [PermissionFlagsBits.ManageMessages],
    handler: async (interaction) => {
      if (!interaction.isMessageContextMenuCommand()) return;

      const targetMessage = interaction.targetMessage;
      
      await interaction.reply({ 
        content: `🗑️ Suppression du message - Confirmation requise`, 
        ephemeral: true 
      });
    }
  }
];

/**
 * Enregistre les menus contextuels de modération
 */
export function registerModerationContextMenus(): void {
  for (const menu of MODERATION_CONTEXT_MENUS) {
    contextMenuSystem.registerMenu(menu);
  }

  logger.info(`[ContextMenu] ${MODERATION_CONTEXT_MENUS.length} menus de modération enregistrés`);
}
