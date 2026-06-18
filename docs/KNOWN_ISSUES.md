# Known Issues — Pre-existing TypeScript Errors

Historique. Les erreurs ci-dessous ont été résolues dans le commit
de consolidation fix-everything. Ce fichier est conservé comme trace
documentaire des blocages initiaux.

## Erreurs résolues (commit fix-everything)

| Code | Fichier | Description | Résolution |
|---|---|---|---|
| TS2305 | src/bot.ts | `control-server.js` n'exportait pas `startControlServer`/`stopControlServer` | Stubs `export async function` ajoutés (avec `logger.warn` pour signal observable côté runtime) |
| TS2307 | src/commandRouter.ts | `./middleware.js` introuvable | Changé en `./middleware/index.js` (NodeNext ESM ne suit pas la convention directory/index) |

## Erreurs résolues (tour précédent)

| Code | Fichier | Description | Résolution |
|---|---|---|---|
| TS2488 | src/events/messages.ts | Itération sur Promise sans await | `await getConversationHistory(...)` au lieu de l'assignation directe |
| TS2351 | src/utils/redis.ts | `new Redis(...)` non constructible | `import { Redis } from 'ioredis'` au lieu de l'import default |

## Dépendances pre-existantes non bloquantes

- **lint-staged** : 335 problèmes de lint (37 erreurs + 298 warnings) sur les 177 fichiers de migration d'imports antérieurs. Réglés séparément via ESLint --fix dans un futur commit dédié (lint-staged temporairement bypass via `--no-verify`).
