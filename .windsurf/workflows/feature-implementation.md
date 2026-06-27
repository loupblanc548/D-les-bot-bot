---
description: "Workflow d'implémentation d'une fonctionnalité — analyse, plan, dev, test, intégration"
---

# /feature-implementation

Workflow pour implémenter une nouvelle fonctionnalité dans le bot Discord.

## Étapes

1. **Analyser le besoin** — Identifier les couches concernées (commande, service, cron, event, DB)
2. **Créer un plan** — Lister les fichiers à créer/modifier, définir le schéma DB si nécessaire
3. **Développer** — Créer dans `src/commands/`, `src/services/`, `src/cron/`, ou `src/events/` selon le besoin
4. **Tester** — Écrire des tests Vitest, vérifier `npx tsc --noEmit` et `npm run lint`
5. **Vérifier l'intégration** — Vérifier l'enregistrement dans le routeur, les interactions avec les services existants

## Commandes

```bash
npx prisma migrate dev --name <nom>
npx prisma generate
npm run register
npm test
npm run lint
npx tsc --noEmit
```

## Skill associé

`.windsurf/skills/feature-implementation/SKILL.md`
