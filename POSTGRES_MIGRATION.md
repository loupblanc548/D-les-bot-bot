# Guide de Migration SQLite → PostgreSQL

## Prérequis
- PostgreSQL 14+ installé
- Extension `pgcrypto` (pour UUID)

## Étape 1 : Modifier le schéma Prisma

Dans `prisma/schema.prisma`, changer le `datasource` :

```prisma
// Avant (SQLite)
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Après (PostgreSQL)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Supprimer `@prisma/adapter-libsql` et ajouter le driver PostgreSQL :

```bash
npm uninstall @prisma/adapter-libsql
npm install pg
```

## Étape 2 : Mettre à jour prisma.ts

```typescript
// Avant
import { PrismaLibSql } from "@prisma/adapter-libsql";
const adapter = new PrismaLibSql({ url: config.databaseUrl });

// Après
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});
```

## Étape 3 : Configurer la connexion

Dans `.env` :

```env
DATABASE_URL="postgresql://user:password@localhost:5432/discord_bot?schema=public"
```

Avec pooling (PgBouncer ou `pg` natif) :

```env
DATABASE_URL="postgresql://user:password@localhost:5432/discord_bot?schema=public&connection_limit=10&pool_timeout=10"
```

## Étape 4 : Migrer les données

```bash
# Créer la migration Prisma
npx prisma migrate dev --name init_pg

# Si tu as des données existantes en SQLite :
# 1. Exporter : sqlite3 database.sqlite .dump > dump.sql
# 2. Convertir le dump SQLite → PG (ou utiliser pgloader)
# 3. Importer : psql -U user -d discord_bot -f dump_pg.sql
```

## Étape 5 : Optimisations PostgreSQL

```sql
-- Index composites pour les queries fréquentes
CREATE INDEX idx_sanction_user_guild ON "Sanction"("userId", "guildId");
CREATE INDEX idx_source_guild_type ON "Source"("guildId", "type");
CREATE INDEX idx_log_created ON "Log"("createdAt" DESC);
CREATE INDEX idx_notification_created ON "Notification"("createdAt" DESC);
```

## Pooling (prisma.ts)

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.databaseUrl,
    },
  },
  // Pooling natif Prisma (v5+)
  // connection_limit géré via l'URL
});
```

## Rollback vers SQLite

Garder une branche `sqlite` ou utiliser les variables d'env pour choisir :

```typescript
const isPostgres = config.databaseUrl.startsWith("postgresql");
```
