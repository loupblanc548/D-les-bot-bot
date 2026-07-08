/**
 * reminderService.ts — Personal reminders
 *
 * Set reminders that fire after a delay, delivered in the original channel.
 */

import { Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

export interface Reminder {
  id: string;
  userId: string;
  channelId: string;
  text: string;
  remindAt: Date;
  created: boolean;
}

const reminders = new Map<string, Reminder>();

export function setReminder(
  userId: string,
  channelId: string,
  text: string,
  remindAt: Date,
): string {
  const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const reminder: Reminder = { id, userId, channelId, text, remindAt, created: true };
  reminders.set(id, reminder);
  logger.info(`[Reminder] Set ${id} for ${userId} at ${remindAt.toISOString()}`);
  return id;
}

export function cancelReminder(id: string): boolean {
  const deleted = reminders.delete(id);
  if (deleted) logger.info(`[Reminder] Cancelled ${id}`);
  return deleted;
}

export function getUserReminders(userId: string): Reminder[] {
  return Array.from(reminders.values()).filter((r) => r.userId === userId);
}

export async function checkReminders(client: Client): Promise<number> {
  const now = Date.now();
  let fired = 0;

  for (const [id, reminder] of reminders) {
    if (reminder.remindAt.getTime() <= now) {
      try {
        const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
        if (channel && "send" in channel) {
          const embed = new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle("⏰ Rappel")
            .setDescription(reminder.text)
            .addFields({ name: "Demandé par", value: `<@${reminder.userId}>`, inline: true })
            .setTimestamp();

          await channel.send({ content: `<@${reminder.userId}>`, embeds: [embed] });
          fired++;
        }
      } catch (error) {
        logger.error(`[Reminder] Failed to fire ${id}:`, String(error));
      }
      reminders.delete(id);
    }
  }

  if (fired > 0) logger.info(`[Reminder] Fired ${fired} reminders`);
  return fired;
}

export function getReminderCount(): number {
  return reminders.size;
}
