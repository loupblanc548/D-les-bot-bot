---
description: "Workflow de validation avant PR — tests, build, lint, formatage"
---

# /test-before-pr

Workflow pour valider le code avant de créer une Pull Request. Reproduit la CI localement.

## Étapes

1. **Formatage** — `npm run format:check` (ou `npm run format` pour corriger)
2. **Lint** — `npm run lint`
3. **Types** — `npx tsc --noEmit`
4. **Tests** — `npm test`
5. **Couverture** — `npm run test:ci` (seuils: lines 40%, functions 40%, branches 30%)
6. **Build** — `npm run build`

## Commandes

```bash
npm run format:check
npm run format
npm run lint
npx tsc --noEmit
npm test
npm run test:ci
npm run build
```

## Skill associé

`.windsurf/skills/test-before-pr/SKILL.md`
