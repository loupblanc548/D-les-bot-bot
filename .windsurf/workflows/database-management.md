---
description: "Workflow de gestion de base de données — migrations, index, optimisation"
---

# /database-management

Workflow pour gérer la base de données PostgreSQL via Prisma.

## Étapes

1. **Migration** — Modifier `prisma/schema.prisma`, puis `npx prisma migrate dev --name <name>`
2. **Optimisation** — Vérifier les index, utiliser `select` au lieu de `include`, éviter les N+1
3. **Index** — Ajouter `@@index` pour les colonnes fréquemment filtrées
4. **Validation** — Contraintes Prisma, validation Zod, transactions pour les opérations multi-tables
5. **Maintenance** — `npx prisma migrate status`, `npx prisma migrate deploy` (prod)

## Commandes

```bash
npx prisma generate
npx prisma migrate dev --name <name>
npx prisma migrate deploy
npx prisma migrate status
npx prisma studio
npm test
```

## Skill associé

`.windsurf/skills/database-management/SKILL.md`
