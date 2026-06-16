import type { Interaction, Client } from "discord.js";

/** Handler de commande Discord (signature utilisée par le router). */
export type CmdHandler = (interaction: Interaction, client: Client) => Promise<void>;

/**
 * Middleware exécuté AVANT un handler de commande.
 * Doit appeler `next()` pour continuer la chaîne, ou court-circuiter
 * (sans appeler `next()`) pour bloquer la commande.
 */
export type Middleware = (
  interaction: Interaction,
  client: Client,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Compose une chaîne de middlewares autour d'un handler Discord.
 * Modèle "onion" : chaque middleware peut exécuter du code AVANT et APRÈS `next()`.
 * Les middlewares sont exécutés dans l'ordre du tableau.
 */
export function withMiddleware(
  handler: CmdHandler,
  middlewares: Middleware[]
): CmdHandler {
  return async (interaction, client) => {
    const dispatch = async (i: number): Promise<void> => {
      if (i >= middlewares.length) {
        return handler(interaction, client);
      }
      const mw = middlewares[i];
      return mw(interaction, client, () => dispatch(i + 1));
    };
    return dispatch(0);
  };
}
