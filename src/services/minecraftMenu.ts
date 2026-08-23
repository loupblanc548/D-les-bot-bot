/**
 * minecraftMenu.ts — Interactive Minecraft control menu (GTA 5 mod menu style)
 *
 * Replaces slash commands with a visual button-based menu for:
 * - Connect/disconnect to a Bedrock server
 * - Auto-mining (start/stop/status)
 * - Chat messages
 * - Follow/unfollow players
 * - Give items
 * - Equip tools
 * - Farm (start/stop)
 * - Server status
 * - Realm status (Bedrock ping)
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { Client } from "discord.js";
import logger from "../utils/logger.js";

const PREFIX = "mcmenu";
const COLOR_MC = 0x44b366; // Minecraft green
const COLOR_DANGER = 0xff3b3b;
const COLOR_WARN = 0xffaa00;

// ─── Main menu ─────────────────────────────────────────────────────
function buildMainMenu(connected: boolean): {
  embed: EmbedBuilder;
  rows: ActionRowBuilder<ButtonBuilder>[];
} {
  const status = connected ? "🟢 Connecté" : "🔴 Déconnecté";
  const embed = new EmbedBuilder()
    .setTitle("⛏️ **MINECRAFT CONTROL PANEL**")
    .setDescription(
      "```\n" +
        " ╔══════════════════════════════════════╗\n" +
        ` ║   Statut: ${status.padEnd(26)} ║\n` +
        " ╠══════════════════════════════════════╣\n" +
        " ║  Sélectionne une action ci-dessous    ║\n" +
        " ╚══════════════════════════════════════╝\n" +
        "```",
    )
    .setColor(COLOR_MC)
    .setFooter({ text: "Shadow Broker • MC Control Panel" })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:connect`)
      .setLabel("🔌 Connecter")
      .setStyle(connected ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(connected),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:disconnect`)
      .setLabel("❌ Déconnecter")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!connected),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:status`)
      .setLabel("📊 Statut")
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:mine`)
      .setLabel("⛏️ Auto-Mine")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!connected),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:farm`)
      .setLabel("🌾 Farm")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!connected),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:chat`)
      .setLabel("💬 Chat")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!connected),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:follow`)
      .setLabel("🚶 Suivre")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!connected),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:give`)
      .setLabel("🎁 Give")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!connected),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:equip`)
      .setLabel("🗡️ Équiper")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!connected),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:realm`)
      .setLabel("🏰 Realm Status")
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, rows: [row1, row2, row3] };
}

// ─── Mining mode select ────────────────────────────────────────────
function buildMiningMenu(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<StringSelectMenuBuilder>;
  backRow: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle("⛏️ Auto-Mining — Choisis le mode")
    .setColor(COLOR_MC)
    .setDescription("Sélectionne le mode de mining dans le menu déroulant.")
    .setFooter({ text: "Shadow Broker • MC Control" });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:mine_mode`)
    .setPlaceholder("Mode de mining...")
    .addOptions([
      {
        label: "Strip Mining",
        description: "Mine en lignes droites (le plus efficace)",
        value: "strip",
        emoji: "⛏️",
      },
      {
        label: "Branch Mining",
        description: "Mine en branches à différents niveaux",
        value: "branch",
        emoji: "🌿",
      },
      {
        label: "Quarry Mining",
        description: "Mine une grande zone en surface",
        value: "quarry",
        emoji: "🏗️",
      },
      { label: "Stop Mining", description: "Arrête l'auto-mining", value: "stop", emoji: "🛑" },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:back`)
      .setLabel("⬅️ Retour")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row, backRow };
}

// ─── Farm mode select ──────────────────────────────────────────────
function buildFarmMenu(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<StringSelectMenuBuilder>;
  backRow: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle("🌾 Farm — Choisis le mode")
    .setColor(COLOR_MC)
    .setDescription("Sélectionne le mode d'agriculture.")
    .setFooter({ text: "Shadow Broker • MC Control" });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:farm_mode`)
    .setPlaceholder("Mode de farm...")
    .addOptions([
      {
        label: "Wheat (Blé)",
        description: "Planter et récolter du blé",
        value: "wheat",
        emoji: "🌾",
      },
      {
        label: "Carrots (Carottes)",
        description: "Planter et récolter des carottes",
        value: "carrot",
        emoji: "🥕",
      },
      {
        label: "Potatoes (Pommes de terre)",
        description: "Planter et récolter des patates",
        value: "potato",
        emoji: "🥔",
      },
      {
        label: "Beetroots (Betteraves)",
        description: "Planter et récolter des betteraves",
        value: "beetroot",
        emoji: "🫐",
      },
      { label: "Stop Farm", description: "Arrête l'agriculture", value: "stop", emoji: "🛑" },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:back`)
      .setLabel("⬅️ Retour")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row, backRow };
}

// ─── Equip tool select ─────────────────────────────────────────────
function buildEquipMenu(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<StringSelectMenuBuilder>;
  backRow: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle("🗡️ Équiper un outil")
    .setColor(COLOR_MC)
    .setDescription("Sélectionne l'outil à équiper dans la main du bot.")
    .setFooter({ text: "Shadow Broker • MC Control" });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:equip_tool`)
    .setPlaceholder("Type d'outil...")
    .addOptions([
      {
        label: "Pioche en diamant",
        description: "Diamond Pickaxe",
        value: "diamond_pickaxe",
        emoji: "⛏️",
      },
      { label: "Hache en diamant", description: "Diamond Axe", value: "diamond_axe", emoji: "🪓" },
      {
        label: "Pelle en diamant",
        description: "Diamond Shovel",
        value: "diamond_shovel",
        emoji: "🪏",
      },
      {
        label: "Épée en diamant",
        description: "Diamond Sword",
        value: "diamond_sword",
        emoji: "🗡️",
      },
      { label: "Pioche en fer", description: "Iron Pickaxe", value: "iron_pickaxe", emoji: "⛏️" },
      {
        label: "Pioche en pierre",
        description: "Stone Pickaxe",
        value: "stone_pickaxe",
        emoji: "⛏️",
      },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:back`)
      .setLabel("⬅️ Retour")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row, backRow };
}

// ─── Check if MC bot is connected ──────────────────────────────────
async function isMcBotConnected(): Promise<boolean> {
  try {
    const { getBotStatus } = await import("./minecraftBot.js");
    const status = getBotStatus();
    return status?.connected ?? false;
  } catch {
    return false;
  }
}

// ─── Handle button interactions ────────────────────────────────────
export async function handleMcMenuButton(
  interaction: ButtonInteraction,
  _client: Client,
): Promise<boolean> {
  if (!interaction.customId.startsWith(PREFIX)) return false;

  const action = interaction.customId.replace(`${PREFIX}:`, "");

  switch (action) {
    case "back": {
      const connected = await isMcBotConnected();
      const { embed, rows } = buildMainMenu(connected);
      await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
      return true;
    }

    case "connect": {
      // Open modal for IP/port/pseudo
      const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}:connect_modal`)
        .setTitle("🔌 Connexion Serveur Bedrock");

      const ipInput = new TextInputBuilder()
        .setCustomId("ip")
        .setLabel("IP du serveur (ou code Realm)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("play.example.com ou ABC123XYZ")
        .setRequired(true);

      const portInput = new TextInputBuilder()
        .setCustomId("port")
        .setLabel("Port (défaut: 19132)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("19132")
        .setRequired(false);

      const pseudoInput = new TextInputBuilder()
        .setCustomId("pseudo")
        .setLabel("Pseudo du bot (défaut: ShadowBot)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ShadowBot")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(portInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(pseudoInput),
      );

      await interaction.showModal(modal);
      return true;
    }

    case "disconnect": {
      try {
        const { disconnectBot } = await import("./minecraftBot.js");
        disconnectBot();
        const connected = await isMcBotConnected();
        const { embed, rows } = buildMainMenu(connected);
        embed.setTitle("✅ Déconnecté").setDescription("Le bot Minecraft a été déconnecté.");
        await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
      } catch (e) {
        await interaction
          .reply({
            content: `❌ Erreur déconnexion: ${e instanceof Error ? e.message : String(e)}`,
            ephemeral: true,
          })
          .catch(() => {});
      }
      return true;
    }

    case "status": {
      try {
        const { getBotStatus } = await import("./minecraftBot.js");
        const status = getBotStatus();
        const embed = new EmbedBuilder()
          .setTitle("📊 Statut Bot Minecraft")
          .setColor(status?.connected ? COLOR_MC : COLOR_DANGER)
          .addFields(
            { name: "Connecté", value: status?.connected ? "🟢 Oui" : "🔴 Non", inline: true },
            { name: "Serveur", value: status?.host || "N/A", inline: true },
            { name: "Pseudo", value: status?.username || "N/A", inline: true },
            { name: "Mining", value: status?.mining ? "⛏️ En cours" : "⏸️ Arrêté", inline: true },
            { name: "Blocs minés", value: `${status?.blocksMined || 0}`, inline: true },
            { name: "Santé", value: `${status?.health || 0}/20`, inline: true },
            {
              name: "Position",
              value: status?.position
                ? `x:${status.position.x} y:${status.position.y} z:${status.position.z}`
                : "N/A",
              inline: true,
            },
          )
          .setFooter({ text: "Shadow Broker • MC Control" })
          .setTimestamp();

        const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PREFIX}:back`)
            .setLabel("⬅️ Retour")
            .setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({ embeds: [embed], components: [backRow] }).catch(() => {});
      } catch (e) {
        await interaction
          .reply({
            content: `❌ Erreur statut: ${e instanceof Error ? e.message : String(e)}`,
            ephemeral: true,
          })
          .catch(() => {});
      }
      return true;
    }

    case "mine": {
      const { embed, row, backRow } = buildMiningMenu();
      await interaction.update({ embeds: [embed], components: [row, backRow] }).catch(() => {});
      return true;
    }

    case "farm": {
      const { embed, row, backRow } = buildFarmMenu();
      await interaction.update({ embeds: [embed], components: [row, backRow] }).catch(() => {});
      return true;
    }

    case "equip": {
      const { embed, row, backRow } = buildEquipMenu();
      await interaction.update({ embeds: [embed], components: [row, backRow] }).catch(() => {});
      return true;
    }

    case "chat": {
      const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}:chat_modal`)
        .setTitle("💬 Envoyer un message");

      const msgInput = new TextInputBuilder()
        .setCustomId("message")
        .setLabel("Message à envoyer dans le chat MC")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Salut tout le monde !")
        .setRequired(true)
        .setMaxLength(200);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(msgInput));

      await interaction.showModal(modal);
      return true;
    }

    case "follow": {
      const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}:follow_modal`)
        .setTitle("🚶 Suivre un joueur");

      const playerInput = new TextInputBuilder()
        .setCustomId("joueur")
        .setLabel("Nom du joueur à suivre")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Steve")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(playerInput));

      await interaction.showModal(modal);
      return true;
    }

    case "give": {
      const modal = new ModalBuilder().setCustomId(`${PREFIX}:give_modal`).setTitle("🎁 Give item");

      const itemInput = new TextInputBuilder()
        .setCustomId("item")
        .setLabel("Nom de l'item (ex: diamond_sword)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("diamond_sword")
        .setRequired(true);

      const qtyInput = new TextInputBuilder()
        .setCustomId("quantite")
        .setLabel("Quantité (défaut: 1)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("1")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(itemInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(qtyInput),
      );

      await interaction.showModal(modal);
      return true;
    }

    case "realm": {
      const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}:realm_modal`)
        .setTitle("🏰 Statut Realm Bedrock");

      const codeInput = new TextInputBuilder()
        .setCustomId("realm_code")
        .setLabel("Code d'invitation Realm OU IP:port")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ABC123XYZ ou play.example.com:19132")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));

      await interaction.showModal(modal);
      return true;
    }

    default: {
      logger.warn(`[MCMenu] Action inconnue: ${action}`);
      return true;
    }
  }
}

// ─── Handle select menu interactions ───────────────────────────────
export async function handleMcMenuSelect(interaction: any, _client: Client): Promise<boolean> {
  if (!interaction.customId.startsWith(PREFIX)) return false;

  const action = interaction.customId.replace(`${PREFIX}:`, "");

  switch (action) {
    case "mine_mode": {
      const mode = interaction.values[0];
      if (mode === "stop") {
        try {
          const { stopMining } = await import("./minecraftBot.js");
          await stopMining();
          await interaction.update({
            embeds: [new EmbedBuilder().setTitle("🛑 Mining arrêté").setColor(COLOR_WARN)],
            components: [],
          });
        } catch (e) {
          await interaction.reply({ content: `❌ Erreur: ${e}`, ephemeral: true }).catch(() => {});
        }
      } else {
        try {
          const { startMining } = await import("./minecraftBot.js");
          await startMining(mode);
          await interaction.update({
            embeds: [
              new EmbedBuilder().setTitle(`⛏️ Mining démarré — Mode: ${mode}`).setColor(COLOR_MC),
            ],
            components: [],
          });
        } catch (e) {
          await interaction.reply({ content: `❌ Erreur: ${e}`, ephemeral: true }).catch(() => {});
        }
      }
      return true;
    }

    case "farm_mode": {
      const crop = interaction.values[0];
      if (crop === "stop") {
        try {
          const { stopFarming } = await import("./minecraftBot.js");
          await stopFarming();
          await interaction.update({
            embeds: [new EmbedBuilder().setTitle("🛑 Farm arrêté").setColor(COLOR_WARN)],
            components: [],
          });
        } catch (e) {
          await interaction.reply({ content: `❌ Erreur: ${e}`, ephemeral: true }).catch(() => {});
        }
      } else {
        try {
          const { startFarming } = await import("./minecraftBot.js");
          await startFarming(crop);
          await interaction.update({
            embeds: [
              new EmbedBuilder().setTitle(`🌾 Farm démarré — Culture: ${crop}`).setColor(COLOR_MC),
            ],
            components: [],
          });
        } catch (e) {
          await interaction.reply({ content: `❌ Erreur: ${e}`, ephemeral: true }).catch(() => {});
        }
      }
      return true;
    }

    case "equip_tool": {
      const tool = interaction.values[0];
      try {
        const { equipTool } = await import("./minecraftBot.js");
        await equipTool(tool);
        await interaction.update({
          embeds: [new EmbedBuilder().setTitle(`🗡️ Équipé: ${tool}`).setColor(COLOR_MC)],
          components: [],
        });
      } catch (e) {
        await interaction.reply({ content: `❌ Erreur: ${e}`, ephemeral: true }).catch(() => {});
      }
      return true;
    }

    default:
      return false;
  }
}

// ─── Handle modal submissions ──────────────────────────────────────
export async function handleMcMenuModal(
  interaction: ModalSubmitInteraction,
  _client: Client,
): Promise<boolean> {
  if (!interaction.customId.startsWith(PREFIX)) return false;

  const action = interaction.customId.replace(`${PREFIX}:`, "");

  switch (action) {
    case "connect_modal": {
      const ip = interaction.fields.getTextInputValue("ip");
      const portStr = interaction.fields.getTextInputValue("port") || "19132";
      const pseudo = interaction.fields.getTextInputValue("pseudo") || "ShadowBot";
      const port = parseInt(portStr) || 19132;

      try {
        const { connectBot } = await import("./minecraftBot.js");
        const result = await connectBot({ host: ip, port, username: pseudo, offline: true });
        if (!result.success) throw new Error(result.message);
        await interaction.reply({
          content: `✅ Bot Minecraft connecté à **${ip}:${port}** en tant que **${pseudo}**`,
          ephemeral: true,
        });
      } catch (e) {
        await interaction
          .reply({
            content: `❌ Erreur connexion: ${e instanceof Error ? e.message : String(e)}`,
            ephemeral: true,
          })
          .catch(() => {});
      }
      return true;
    }

    case "chat_modal": {
      const message = interaction.fields.getTextInputValue("message");
      try {
        const { sendChat } = await import("./minecraftBot.js");
        sendChat(message);
        await interaction.reply({
          content: `💬 Message envoyé: "${message}"`,
          ephemeral: true,
        });
      } catch (e) {
        await interaction
          .reply({
            content: `❌ Erreur chat: ${e instanceof Error ? e.message : String(e)}`,
            ephemeral: true,
          })
          .catch(() => {});
      }
      return true;
    }

    case "follow_modal": {
      const joueur = interaction.fields.getTextInputValue("joueur");
      try {
        const { followPlayer } = await import("./minecraftBot.js");
        await followPlayer(joueur);
        await interaction.reply({
          content: `🚶 Le bot suit maintenant **${joueur}**`,
          ephemeral: true,
        });
      } catch (e) {
        await interaction
          .reply({
            content: `❌ Erreur follow: ${e instanceof Error ? e.message : String(e)}`,
            ephemeral: true,
          })
          .catch(() => {});
      }
      return true;
    }

    case "give_modal": {
      const item = interaction.fields.getTextInputValue("item");
      const qtyStr = interaction.fields.getTextInputValue("quantite") || "1";
      const qty = parseInt(qtyStr) || 1;

      try {
        const { giveItem } = await import("./minecraftBot.js");
        await giveItem(item, qty);
        await interaction.reply({
          content: `🎁 Item donné: **${item}** x${qty}`,
          ephemeral: true,
        });
      } catch (e) {
        await interaction
          .reply({
            content: `❌ Erreur give: ${e instanceof Error ? e.message : String(e)}`,
            ephemeral: true,
          })
          .catch(() => {});
      }
      return true;
    }

    case "realm_modal": {
      const code = interaction.fields.getTextInputValue("realm_code");
      await interaction.deferReply({ ephemeral: true });

      try {
        const { getBedrockServerStatus } = await import("./bedrockPing.js");
        const result = await getBedrockServerStatus(code);
        await interaction.editReply({ content: result.slice(0, 2000) });
      } catch (e) {
        await interaction.editReply({
          content: `❌ Erreur Realm: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      return true;
    }

    default:
      return false;
  }
}

// ─── Slash command entry point ─────────────────────────────────────
export async function showMcMenu(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const connected = await isMcBotConnected();
  const { embed, rows } = buildMainMenu(connected);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: rows }).catch(() => {});
  } else {
    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true }).catch(() => {});
  }

  logger.info(`[MCMenu] Opened by ${interaction.user.username} (${interaction.user.id})`);
}
