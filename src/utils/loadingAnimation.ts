/**
 * loadingAnimation.ts — Helper pour animations de chargement Discord
 *
 * Fournit une animation textuelle qui se met à jour pendant le traitement.
 * Utilise editReply pour mettre à jour le message en temps réel.
 *
 * Usage:
 *   const anim = new LoadingAnimation(interaction, "Suppression en cours");
 *   await anim.start();
 *   // ... travail ...
 *   await anim.update(50, "50 messages supprimés");
 *   await anim.stop(embed); // ou anim.stop("Texte final")
 */

import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class LoadingAnimation {
  private interaction: ChatInputCommandInteraction;
  private title: string;
  private currentFrame = 0;
  private interval: NodeJS.Timeout | null = null;
  private detail = "";
  private progress = 0;
  private started = false;

  constructor(interaction: ChatInputCommandInteraction, title: string) {
    this.interaction = interaction;
    this.title = title;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // If interaction was already replied (e.g. after requestConfirmation),
    // use editReply instead of deferReply to avoid InteractionHasAlreadyReplied error
    if (!this.interaction.deferred && !this.interaction.replied) {
      await this.interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    }

    this.interval = setInterval(async () => {
      this.currentFrame = (this.currentFrame + 1) % FRAMES.length;
      await this.render();
    }, 200);
    if (this.interval.unref) this.interval.unref();

    await this.render();
  }

  async update(progress: number, detail?: string): Promise<void> {
    this.progress = Math.min(100, Math.max(0, progress));
    if (detail !== undefined) this.detail = detail;
    await this.render();
  }

  private async render(): Promise<void> {
    const frame = FRAMES[this.currentFrame];
    const bar = this.progressBar(this.progress);
    const text = `${frame} **${this.title}**\n${bar} ${this.progress}%${this.detail ? `\n\`${this.detail}\`` : ""}`;

    try {
      if (this.interaction.deferred || this.interaction.replied) {
        await this.interaction.editReply({ content: text });
      }
    } catch {
      // Ignore edit errors (rate limited, etc.)
    }
  }

  private progressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }

  async stop(finalContent: EmbedBuilder | string): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    try {
      if (this.interaction.deferred || this.interaction.replied) {
        if (finalContent instanceof EmbedBuilder) {
          await this.interaction.editReply({ content: "", embeds: [finalContent] });
        } else {
          await this.interaction.editReply({ content: finalContent });
        }
      }
    } catch {
      // Ignore
    }
  }
}
