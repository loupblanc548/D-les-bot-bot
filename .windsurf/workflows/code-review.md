---
description: "Workflow de revue de code — qualité, sécurité, perfs, architecture"
---

# /code-review

Workflow pour effectuer une revue de code structurée.

## Étapes

1. **Qualité du code** — Vérifier les types, les `any`, la gestion d'erreurs, la duplication
2. **Sécurité** — Vérifier les secrets, la validation Zod, les permissions, le whitelist
3. **Performances** — Vérifier le cache Redis, les N+1 Prisma, l'async/await
4. **Architecture** — Vérifier la séparation des couches (commands → services → data)
5. **Bonnes pratiques** — Lancer `npm run lint`, `npm run format:check`, `npx tsc --noEmit`, `npm run test:ci`

## Commandes

```bash
npm run lint
npm run format:check
npx tsc --noEmit
npm run test:ci
```

## Skill associé

`.windsurf/skills/code-review/SKILL.md`
