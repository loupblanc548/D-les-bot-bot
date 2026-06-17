/**
 * Zod validation utilities for slash commands
 * Provides type-safe validation for command options
 */

import { z } from "zod";
import type { ChatInputCommandInteraction } from "discord.js";

/**
 * Generic command option validator
 */
export function createCommandValidator<T extends z.ZodType>(
  schema: T,
): (options: Record<string, unknown>) => z.infer<T> {
  return (options: Record<string, unknown>) => {
    return schema.parse(options);
  };
}

/**
 * Common Zod schemas for Discord command options
 */
export const CommonSchemas = {
  userId: z.string().min(1, "User ID is required"),
  guildId: z.string().min(1, "Guild ID is required"),
  channelId: z.string().min(1, "Channel ID is required"),
  messageId: z.string().min(1, "Message ID is required"),
  roleId: z.string().min(1, "Role ID is required"),

  positiveInteger: z.number().int().positive("Must be a positive integer"),
  nonNegativeInteger: z.number().int().nonnegative("Must be a non-negative integer"),

  url: z.string().url("Must be a valid URL"),
  discordInvite: z
    .string()
    .regex(
      /^https?:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/,
      "Must be a valid Discord invite",
    ),

  duration: z.string().regex(/^\d+[smhd]$/, "Must be a valid duration (e.g., 10m, 1h, 2d)"),

  reason: z.string().max(512, "Reason must be less than 512 characters").optional(),

  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username must be 2-32 alphanumeric characters"),
};

/**
 * Validates command options against a Zod schema
 * @param interaction - The command interaction
 * @param schema - The Zod schema to validate against
 * @returns Parsed and validated options
 * @throws ZodError if validation fails
 */
export async function validateCommandOptions<T extends z.ZodType>(
  interaction: ChatInputCommandInteraction,
  schema: T,
): Promise<z.infer<T>> {
  const options: Record<string, unknown> = {};

  // Get all options from the interaction
  const optionData = interaction.options.data;
  if (optionData && Array.isArray(optionData)) {
    optionData.forEach((option: { name: string; value: unknown }) => {
      options[option.name] = option.value;
    });
  }

  return schema.parseAsync(options);
}

/**
 * Creates a validation error response for Discord
 */
export function createValidationError(errors: z.ZodError): string {
  const errorMessages = errors.issues.map((err: z.ZodIssue) => {
    const field = err.path.join(".");
    return `${field}: ${err.message}`;
  });

  return `Validation failed:\n${errorMessages.join("\n")}`;
}

/**
 * Middleware function to validate command options
 * Returns true if validation passes, false otherwise
 */
export async function validateCommandMiddleware<T extends z.ZodType>(
  interaction: ChatInputCommandInteraction,
  schema: T,
): Promise<{ valid: boolean; data?: z.infer<T>; error?: string }> {
  try {
    const data = await validateCommandOptions(interaction, schema);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: createValidationError(error) };
    }
    return { valid: false, error: "Validation failed" };
  }
}

/**
 * Common command schemas for frequently used patterns
 */
export const CommandSchemas = {
  ban: z.object({
    user: CommonSchemas.userId,
    reason: CommonSchemas.reason,
    deleteMessageDays: CommonSchemas.nonNegativeInteger.optional(),
  }),

  kick: z.object({
    user: CommonSchemas.userId,
    reason: CommonSchemas.reason,
  }),

  mute: z.object({
    user: CommonSchemas.userId,
    duration: CommonSchemas.duration,
    reason: CommonSchemas.reason,
  }),

  timeout: z.object({
    user: CommonSchemas.userId,
    duration: CommonSchemas.duration,
    reason: CommonSchemas.reason,
  }),

  warn: z.object({
    user: CommonSchemas.userId,
    reason: z.string().min(1, "Reason is required").max(512),
  }),

  purge: z.object({
    amount: CommonSchemas.positiveInteger,
    channel: CommonSchemas.channelId.optional(),
  }),

  slowmode: z.object({
    duration: CommonSchemas.duration,
    channel: CommonSchemas.channelId.optional(),
  }),

  announce: z.object({
    message: z.string().min(1).max(2000),
    channel: CommonSchemas.channelId,
  }),

  setrole: z.object({
    user: CommonSchemas.userId,
    role: CommonSchemas.roleId,
  }),
};
