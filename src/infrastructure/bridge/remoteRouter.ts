/**
 * remoteRouter.ts — Remote Procedure Router
 *
 * Handles the execution flow when a command is offloaded to the Worker:
 * 1. Master defers the Discord interaction
 * 2. Packages the request
 * 3. Dispatches via WebSocket bridge
 * 4. Awaits the result with timeout
 * 5. Edits the interaction reply with the result
 *
 * Memory-safe: all pending promises are cleaned up on completion or timeout.
 */

import type { ChatInputCommandInteraction, APIEmbed } from "discord.js";
import logger from "../../utils/logger.js";
import { dispatchJob, isWorkerOnline } from "./bridgeServer.js";
import { evaluateOffload, recordExecution } from "../monitors/offloadController.js";
import { isOffloadableCommand } from "./bridgeTypes.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const REMOTE_JOB_TIMEOUT_MS = 30_000;
const REMOTE_FALLBACK_NOTIFY = true;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RemoteExecutionResult {
  success: boolean;
  content?: string;
  embeds?: APIEmbed[];
  error?: string;
  fromWorker: boolean;
  executionMs: number;
}

// ─── Core: Try Remote Execution ──────────────────────────────────────────────

/**
 * Attempt to offload a command execution to the remote worker.
 * Returns null if offloading is not possible (worker offline, command not eligible).
 */
export async function tryRemoteExecution(
  interaction: ChatInputCommandInteraction,
): Promise<RemoteExecutionResult | null> {
  const command = interaction.commandName;
  const subcommand = interaction.options.getSubcommand(false) || undefined;

  // Check if command is eligible for offloading
  if (!isOffloadableCommand(command)) {
    return null;
  }

  // Check memory + worker status
  const decision = evaluateOffload();
  if (decision.target !== "remote") {
    return null;
  }

  if (!isWorkerOnline()) {
    return null;
  }

  // Package the request
  const options = extractInteractionOptions(interaction);

  logger.info(
    `[RemoteRouter] Offloading /${command}${subcommand ? ` ${subcommand}` : ""} ` +
      `to worker (heap: ${decision.heapGB.toFixed(2)}GB)`,
  );

  try {
    const result = await dispatchJob(
      command,
      subcommand,
      {
        options,
        userId: interaction.user.id,
        guildId: interaction.guildId || "",
        channelId: interaction.channelId,
        username: interaction.user.username,
        locale: interaction.locale,
      },
      REMOTE_JOB_TIMEOUT_MS,
    );

    recordExecution("remote");

    return {
      success: result.status === "success",
      content: result.data.content || result.data.textResult,
      embeds: result.data.embedsPayload as APIEmbed[] | undefined,
      error: result.error,
      fromWorker: true,
      executionMs: result.executionMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[RemoteRouter] Remote execution failed: ${errorMsg}`);

    // Return failure — caller should fallback to local
    return {
      success: false,
      error: errorMsg,
      fromWorker: false,
      executionMs: 0,
    };
  }
}

/**
 * Extract all interaction options into a plain object for transport.
 */
function extractInteractionOptions(
  interaction: ChatInputCommandInteraction,
): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  // Get all options from the interaction
  const rawOptions = interaction.options.data;
  for (const opt of rawOptions) {
    if (opt.value !== undefined) {
      options[opt.name] = opt.value;
    }
    // Handle subcommand groups and subcommands
    if (opt.options && Array.isArray(opt.options)) {
      for (const subOpt of opt.options) {
        if (subOpt.value !== undefined) {
          options[subOpt.name] = subOpt.value;
        }
      }
    }
  }

  return options;
}

/**
 * Apply a remote execution result to a Discord interaction.
 */
export async function applyRemoteResult(
  interaction: ChatInputCommandInteraction,
  result: RemoteExecutionResult,
): Promise<void> {
  if (result.success) {
    const replyPayload: { content?: string; embeds?: APIEmbed[] } = {};
    if (result.content) replyPayload.content = result.content;
    if (result.embeds && result.embeds.length > 0) replyPayload.embeds = result.embeds;

    await interaction.editReply(replyPayload).catch((err) => {
      logger.warn(
        `[RemoteRouter] Failed to edit reply: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  } else {
    const fallbackMsg = result.error
      ? `⚠️ Le worker n'a pas pu traiter cette commande: ${result.error}`
      : "⚠️ Erreur lors de l'exécution distante.";

    await interaction.editReply({ content: fallbackMsg }).catch(() => {});
  }
}

/**
 * Notify the user that the command is being processed remotely.
 */
export async function notifyRemoteProcessing(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!REMOTE_FALLBACK_NOTIFY) return;

  // The interaction is already deferred — edit the deferred reply
  await interaction
    .editReply({
      content: "🖥️ Exécution déléguée au nœud worker (offload mémoire)...",
    })
    .catch(() => {});
}
