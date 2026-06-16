"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withMiddleware = withMiddleware;
/**
 * Compose une chaîne de middlewares autour d'un handler Discord.
 * Modèle "onion" : chaque middleware peut exécuter du code AVANT et APRÈS `next()`.
 * Les middlewares sont exécutés dans l'ordre du tableau.
 */
function withMiddleware(handler, middlewares) {
    return async (interaction, client) => {
        const dispatch = async (i) => {
            if (i >= middlewares.length) {
                return handler(interaction, client);
            }
            const mw = middlewares[i];
            return mw(interaction, client, () => dispatch(i + 1));
        };
        return dispatch(0);
    };
}
//# sourceMappingURL=compose.js.map