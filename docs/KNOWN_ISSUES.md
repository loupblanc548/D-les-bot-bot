# Known Issues — Pre-existing TypeScript Errors

Ces erreurs n'ont pas été introduites par les modifications récentes du fichier
`tsconfig.json` ni par la migration des imports. Elles existaient avant le
processus de mise à jour NodeNext et restent à corriger au cas par cas.

## Erreurs pré-existantes (strict mode activé en tsconfig v2)

| Fichier | Code | Description |
|---|---|---|
| `src/bot.ts` | TS2307 | Module `./middleware.js` introuvable |
| `src/commandRouter.ts` | TS2305 | Exports `startControlServer` / `stopControlServer` manquants dans `control-server.js` |
| `src/events/messages.ts` | TS2488 | Itération sur une `Promise` (manque `await`) |
| `src/utils/redis.ts` | TS2351 | Constructeur `ioredis` mal typé/initialisé |
| `src/rawgClient.d.ts` | TS2714 | Ambiguïté de types génériques |
| `src/rssTwitterTracker.d.ts` | TS2714 | Ambiguïté de types génériques |

## Pourquoi elles n'ont pas été fixées ici

Le respect strict du périmètre demandé ne nous permet pas de deviner le
comportement attendu pour chacune de ces fonctions. Ces corrections nécessitent
chacune :

1. Une lecture attentive de l'intention métier du fichier.
2. Une vérification croisée avec Discord.js / Prisma / ioredis.
3. Un test associé (unitaire ou d'intégration).

## Action recommandée

Ouvrir une PR dédiée pour chacune (ou un commit par fichier) en suivant
ce plan :

```bash
# Pour chaque fichier, ajouter/ajuster un test :
#   src/bot.test.ts → fail avec TS2307 actuel, doit passer après fix
# Puis modifier le code pour qu'il typecheck + passe le test.
```

## Pistes de fix probable (non testées)

- `src/commandRouter.ts` TS2305 : vérifier que `control-server.ts` exporte bien
  `startControlServer` et `stopControlServer`. Le bug semble être un naming
  cassé.
- `src/events/messages.ts` TS2488 : remplacer `for (const x of somePromise)`
  par `for await (const x of somePromise)` ou `for (const x of await somePromise)`.
- `src/utils/redis.ts` TS2351 : `new Redis({...})` devrait accepter une chaîne
  OU un objet — vérifier la signature `ioredis.RedisOptions`.
- `src/rawgClient.d.ts` / `src/rssTwitterTracker.d.ts` : types génériques
  ambigus nécessitant explicitation (probable T extends {} constraints).
