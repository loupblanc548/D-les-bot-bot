---
description: "Workflow de mise à jour des dépendances npm avec vérification"
---

# /dependency-update

Workflow pour mettre à jour les dépendances en toute sécurité.

## Étapes

1. **Vérifier l'état actuel** — `npm outdated`, `npm audit`, `npm test`
2. **Mettre à jour** — `npm update` (patch/minor) ou `npm install <pkg>@<version>` (majeure)
3. **Vérifier les conflits** — `npm ls`, vérifier les peer dependencies
4. **Tester** — `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
5. **Valider** — Démarrer le bot, vérifier les connexions DB et Redis

## Commandes

```bash
npm outdated
npm audit
npm update
npx prisma generate
npm test
npx tsc --noEmit
npm run build
```

## Skill associé

`.windsurf/skills/dependency-update/SKILL.md`
