---
description: "Workflow de correction de bug — analyse, reproduction, correction, test"
---

# /bug-fix

Workflow pour diagnostiquer et corriger un bug dans le bot Discord.

## Étapes

1. **Analyser l'erreur** — Lire le message d'erreur, la stack trace, identifier le fichier dans `src/`
2. **Reproduire** — Créer ou identifier un test Vitest qui reproduit le bug
3. **Corriger** — Appliquer la correction minimale à la cause racine
4. **Tester** — Lancer `npm test -- <fichier>`, puis `npm test`, puis `npx tsc --noEmit`, puis `npm run lint`
5. **Documenter** — Ajouter un commentaire si la correction est non-évidente

## Commandes

```bash
npx tsc --noEmit
npm run lint
npm test
npm test -- src/path/to/file.test.ts
```

## Vérifications

- [ ] Le test de reproduction passe
- [ ] Aucun test existant ne régresse
- [ ] `npx tsc --noEmit` passe
- [ ] `npm run lint` passe

## Skill associé

`.windsurf/skills/bug-fix/SKILL.md`
