# Skill: database-management

## Nom
Database Management — Migrations, optimisation, index, validation

## Description
Gestion de la base de données PostgreSQL via Prisma : création de migrations, optimisation des requêtes, gestion des index et validation des données.

## Quand l'utiliser
- Ajout ou modification d'un modèle Prisma
- Création d'une migration
- Optimisation de requêtes lentes
- Ajout d'index
- Validation de données

## Déclencheurs
- "database management"
- "migration"
- "prisma"
- "optimisation requête"
- "index"
- "schema"
- "db"

## Prérequis
- Prisma CLI installé (`prisma` dans devDependencies)
- PostgreSQL accessible (Docker ou local)
- Schéma Prisma dans `prisma/schema.prisma`
- `DATABASE_URL` configurée dans `.env`

## Étapes détaillées

### 1. Création de migrations
- Modifier `prisma/schema.prisma` (ajouter/modifier un modèle, un champ, une relation)
- Créer la migration : `npx prisma migrate dev --name <description>`
- Vérifier le fichier de migration généré dans `prisma/migrations/`
- Régénérer le client : `npx prisma generate`
- Vérifier les types TypeScript mis à jour

### 2. Optimisation des requêtes
- Identifier les requêtes lentes avec `EXPLAIN ANALYZE`
- Vérifier l'utilisation des index (scan vs index scan)
- Utiliser `select` au lieu de `include` complet pour réduire les données récupérées
- Éviter les N+1 queries (utiliser `include` ou `findMany` avec relations)
- Utiliser la pagination (`skip`, `take`) pour les grandes listes

### 3. Index
- Ajouter des `@@index` dans le schéma Prisma pour les colonnes fréquemment filtrées
- Vérifier les index composites pour les queries multi-colonnes
- Vérifier les `@@unique` pour les contraintes d'unicité
- Éviter les index inutiles (trop d'index = écritures lentes)
- Vérifier l'impact des index sur les performances d'écriture

### 4. Validation des données
- Utiliser les contraintes Prisma (`@unique`, `@default`, types)
- Valider les entrées avec Zod avant d'écrire en DB
- Vérifier l'intégrité référentielle (relations, cascades)
- Utiliser les transactions Prisma pour les opérations multi-tables

### 5. Maintenance
- Vérifier l'état des migrations : `npx prisma migrate status`
- Appliquer les migrations en production : `npx prisma migrate deploy`
- Vérifier la connexion DB : health check
- Surveiller la taille des tables

## Commandes exécutables
```bash
npx prisma generate                    # Générer le client
npx prisma migrate dev --name <name>   # Créer une migration (dev)
npx prisma migrate deploy              # Appliquer les migrations (prod)
npx prisma migrate status              # État des migrations
npx prisma studio                      # Interface visuelle de la DB
npx prisma db push                     # Synchroniser le schéma (sans migration)
npm test                               # Tests
```

## Vérifications finales
- [ ] La migration est créée et testée
- [ ] Le client Prisma est régénéré
- [ ] Les index nécessaires sont ajoutés
- [ ] Les types TypeScript sont à jour
- [ ] Les tests passent
- [ ] `npx prisma migrate status` montre un état cohérent

## Gestion des erreurs
- Si la migration échoue : vérifier la connexion DB et le SQL généré
- Si les types Prisma ne sont pas à jour : `npx prisma generate`
- Si une migration est en drift : `npx prisma migrate resolve` ou recréer
- Si la DB est corrompue : restaurer depuis un backup (`backups/`)

## Bonnes pratiques
- Toujours nommer les migrations de manière descriptive
- Tester les migrations en dev avant de les appliquer en production
- Utiliser `migrate deploy` en production (pas `migrate dev`)
- Ajouter des index pour les colonnes utilisées dans les `where`, `orderBy`, `groupBy`
- Utiliser les transactions pour les opérations multi-tables critiques
- Sauvegarder la DB avant une migration majeure
