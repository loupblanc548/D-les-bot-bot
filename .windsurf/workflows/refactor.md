---
description: "Workflow de refactoring — améliorer le code sans changer le comportement"
---

# /refactor

Workflow pour refactorer du code sans modifier le comportement.

## Étapes

1. **Analyser** — Identifier le code à refactorer, vérifier les tests existants
2. **Refactorer par petites étapes** — Extraire les fonctions, réduire la duplication, améliorer les types
3. **Vérifier après chaque étape** — `npm test`, `npx tsc --noEmit`, `npm run lint`
4. **Vérification finale** — Tous les tests passent, le comportement est identique

## Commandes

```bash
npm test
npx tsc --noEmit
npm run lint
npm run format:check
```

## Skill associé

`.windsurf/skills/refactor/SKILL.md`
