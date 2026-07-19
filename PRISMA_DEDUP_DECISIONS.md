# PRISMA_DEDUP_DECISIONS.md

Analyse des modèles Prisma potentiellement dupliqués.
Date: 2025-07-19
Statut: **Analyse — en attente de validation utilisateur avant toute migration.**

---

## Groupe Modération

### `ModAction` (178-190)

| Champ | Type | Description |
|-------|------|-------------|
| id | Int (auto) | PK |
| guildId | String | Serveur |
| moderatorId | String | Modérateur |
| action | SanctionType | Type d'action (enum) |
| targetId | String | Utilisateur ciblé |
| reason | String? | Raison |
| duration | Int? | Durée (timeout) |
| createdAt | DateTime | Timestamp |

**Usage**: 9 références dans 6 fichiers (`contextMenus.ts`, `analytics.ts`, `anomalyDetector.ts`, `members.ts`, `stealthLeave.ts`, `userSummary.ts`).

**Rôle**: Log append-only des actions de modération. Pas de champ `active` ou `updatedAt` — immuable après création.

**Décision**: **Conserver tel quel.** C'est un log d'audit append-only, distinct de l'état courant.

---

### `WarningLog` (192-202)

| Champ | Type | Description |
|-------|------|-------------|
| id | Int (auto) | PK |
| guildId | String | Serveur |
| userId | String | Utilisateur |
| moderatorId | String? | Modérateur |
| reason | String? | Raison |
| createdAt | DateTime | Timestamp |

**Usage**: 2 références dans 2 fichiers (`members.ts`, `stealthLeave.ts`).

**Rôle**: Log append-only des warns. Pas de champ `active`, `points`, ou `type` — plus simple que `Warning`.

**Décision**: **Fusionner avec `Warning`.** `WarningLog` est un sous-ensemble strict de `Warning` (mêmes champs + `points` + `active` en plus dans `Warning`). `WarningLog` n'est utilisé que dans 2 fichiers, `Warning` dans 2 fichiers également mais avec plus de fonctionnalités.

**Données à migrer**: Les entrées de `WarningLog` seraient backfillées dans `Warning` avec `points = 1` et `active = false` (historique). Aucune donnée perdue.

**Rollback**: Si la fusion pose problème, recréer `WarningLog` depuis `Warning` où `points = 1 AND active = false AND moderatorId IS NOT NULL`. Risque: les enregistrements originaux de `WarningLog` qui n'ont pas de `moderatorId` perdraient cette information (NULL → NULL, pas de perte).

---

### `Sanction` (299-315)

| Champ | Type | Description |
|-------|------|-------------|
| id | Int (auto) | PK |
| userId | String | Utilisateur |
| guildId | String | Serveur |
| moderatorId | String | Modérateur |
| type | SanctionType | Type (enum) |
| reason | String | Raison (requis) |
| duration | Int? | Durée |
| active | Boolean | État courant (actif/inactif) |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Mise à jour |

**Usage**: 55 références dans 20 fichiers. C'est le modèle de modération le plus utilisé.

**Rôle**: État courant des sanctions + historique. Le champ `active` permet de désactiver une sanction sans la supprimer (expire, annulée). `updatedAt` suit les changements d'état.

**Décision**: **Conserver tel quel.** C'est le modèle principal de modération, massivement utilisé. Il sert à la fois d'état courant (`active = true`) et d'historique (`active = false`).

---

### `Warning` (317-329)

| Champ | Type | Description |
|-------|------|-------------|
| id | Int (auto) | PK |
| userId | String | Utilisateur |
| guildId | String | Serveur |
| moderatorId | String? | Modérateur |
| reason | String? | Raison |
| points | Int | Points (défaut: 1) |
| active | Boolean | État courant |
| createdAt | DateTime | Timestamp |

**Usage**: 4 références dans 2 fichiers (`stubHandlers.ts`, `altAccountDetector.ts`).

**Rôle**: État courant des warns avec système de points. Similaire à `Sanction` mais spécialisé pour les warns.

**Décision**: **Fusionner avec `Sanction`.** `Warning` est un cas particulier de `Sanction` où `type = WARN`. Les champs supplémentaires (`points`) peuvent être stockés dans un champ JSON `metadata` sur `Sanction`, ou ajoutés comme colonne optionnelle.

**Alternative**: Si `points` est important pour la logique métier, ajouter `points Int?` à `Sanction` et migrer les `Warning` vers `Sanction` avec `type = WARN`.

**Données à migrer**: Backfill `Warning` → `Sanction` avec `type = WARN`, `reason = reason || "N/A"`, `active = active`, `points` dans un champ `metadata Json?` ou colonne dédiée.

**Rollback**: Recréer `Warning` depuis `Sanction` où `type = WARN`.

---

### Résumé Groupe Modération

| Modèle | Décision | Raison |
|--------|----------|--------|
| `ModAction` | **Conserver** | Log append-only, immuable, distinct |
| `WarningLog` | **Fusionner → `Warning`** | Sous-ensemble strict de `Warning` |
| `Sanction` | **Conserver** | Modèle principal, 55 références |
| `Warning` | **Fusionner → `Sanction`** | Cas particulier de `Sanction` (type=WARN) |

**Résultat après fusion**: 2 modèles au lieu de 4:
- `ModAction` — log append-only immuable
- `Sanction` — état courant + historique avec `type` enum

---

## Groupe Mémoire

### `UserMemory` (1000-1013)

| Champ | Type | Description |
|-------|------|-------------|
| userId | String (PK) | Utilisateur |
| guildId | String? | Serveur |
| tone | String | Ton de conversation |
| locale | String | Langue |
| summary | Text | Résumé de l'utilisateur |
| lastActiveAt | DateTime | Dernière activité |
| facts | MemoryFact[] | Relation |
| messages | MemoryMessage[] | Relation |
| embeddings | MemoryEmbedding[] | Relation |

**Usage**: 16 références dans 6 fichiers.

**Rôle**: Table parent de la mémoire IA. Stocke l'état courant (tone, locale, summary) et sert de pivot pour les tables enfants.

**Décision**: **Conserver tel quel.** C'est le hub central de la mémoire, correctement relationnel.

---

### `MemoryFact` (1015-1034)

| Champ | Type | Description |
|-------|------|-------------|
| id | String (cuid) | PK |
| userId | String | FK → UserMemory |
| key | String | Clé du fait |
| value | Text | Valeur |
| weight | Float | Poids (décroissance) |
| category | String? | Catégorie |
| sourceMsg | String? | Message source |
| createdAt | DateTime | Création |
| updatedAt | DateTime | Mise à jour |
| expiresAt | DateTime? | Expiration |
| accessedAt | DateTime | Dernier accès |
| accessCount | Int | Compteur d'accès |

**Usage**: 26 références dans 8 fichiers.

**Rôle**: Faits individuels sur l'utilisateur (ex: "aime les jeux FPS", "timezone: UTC+1"). Système de poids et d'expiration pour la décroissance temporelle.

**Décision**: **Conserver tel quel.** Modèle central de la mémoire, massivement utilisé, avec logique de décroissance propre.

---

### `MemoryMessage` (1036-1048)

| Champ | Type | Description |
|-------|------|-------------|
| id | String (cuid) | PK |
| userId | String | FK → UserMemory |
| role | String | Rôle (user/assistant) |
| content | Text | Contenu |
| channelId | String? | Salon |
| tokens | Int? | Nombre de tokens |
| createdAt | DateTime | Timestamp |

**Usage**: 5 références dans 2 fichiers (`aiMemory.ts`, `ragMemory.ts`).

**Rôle**: Historique des messages de conversation par utilisateur. Append-only.

**Décision**: **Conserver tel quel.** Log append-only des messages, distinct des faits (qui sont de la connaissance extraite).

---

### `MemoryEmbedding` (1050-1061)

| Champ | Type | Description |
|-------|------|-------------|
| id | String (cuid) | PK |
| userId | String | FK → UserMemory |
| content | Text | Contenu vectorisé |
| embedding | Text | Vecteur (JSON) |
| metadata | Json? | Métadonnées |
| createdAt | DateTime | Timestamp |

**Usage**: 1 référence dans 1 fichier (`ragMemory.ts`).

**Rôle**: Embeddings vectoriels pour RAG sur la mémoire utilisateur.

**Décision**: **Conserver tel quel.** Utilisé peu mais fonctionnellement distinct — c'est le seul modèle qui stocke des vecteurs pour la recherche sémantique.

---

### `MemoryDecayLog` (1063-1072)

| Champ | Type | Description |
|-------|------|-------------|
| id | String (cuid) | PK |
| factsBefore | Int | Faits avant decay |
| factsAfter | Int | Faits après decay |
| ranAt | DateTime | Timestamp d'exécution |
| notes | Text? | Notes |

**Usage**: 1 référence dans 1 fichier (`aiMemory.ts`).

**Rôle**: Log append-only du processus de décroissance des faits. Métadonnée opérationnelle.

**Décision**: **Conserver tel quel.** Log append-only d'opérations de maintenance. Peu utilisé mais sert un but précis (audit du decay).

---

### `MemoryLink` (1250-1264)

| Champ | Type | Description |
|-------|------|-------------|
| id | String (cuid) | PK |
| userId | String | Utilisateur |
| sourceKey | String | Clé source |
| targetKey | String | Clé cible |
| relation | String | Type de relation |
| strength | Float | Force du lien |
| createdAt | DateTime | Création |
| updatedAt | DateTime | Mise à jour |

**Usage**: 4 références dans 2 fichiers (`memoryGrooming.ts`, `aiConversation.ts`).

**Rôle**: Graphe de liens entre faits mémoire (ex: "aime FPS" → "joue à Counter-Strike" avec relation "implies").

**Décision**: **Conserver tel quel.** Modèle de graphe de connaissances, fonctionnellement distinct des faits individuels.

---

### Résumé Groupe Mémoire

| Modèle | Décision | Raison |
|--------|----------|--------|
| `UserMemory` | **Conserver** | Hub central, parent relationnel |
| `MemoryFact` | **Conserver** | Faits extraits, 26 références, logique de decay |
| `MemoryMessage` | **Conserver** | Log append-only des messages |
| `MemoryEmbedding` | **Conserver** | Vecteurs RAG, fonctionnellement unique |
| `MemoryDecayLog` | **Conserver** | Log d'audit du decay |
| `MemoryLink` | **Conserver** | Graphe de connaissances |

**Résultat**: Aucune fusion dans le groupe mémoire. Les 6 modèles servent des buts distincts (état, faits, messages, vecteurs, logs, graphe) et sont correctement relationnels via `UserMemory`.

---

## Plan de migration (à valider avant exécution)

### Phase 1: Fusion `WarningLog` → `Warning`

1. Ajouter `points Int @default(1)` et `active Boolean @default(true)` à `WarningLog` (si manquants)
2. Backfill: `INSERT INTO "Warning" SELECT * FROM "WarningLog"` (avec `points = 1, active = false`)
3. Mettre à jour les 2 fichiers qui référencent `WarningLog` pour utiliser `Warning`
4. Supprimer `WarningLog` du schéma
5. Migration Prisma

### Phase 2: Fusion `Warning` → `Sanction`

1. Ajouter `metadata Json?` à `Sanction` (pour stocker `points`)
2. Backfill: `INSERT INTO "Sanction" (userId, guildId, moderatorId, type, reason, duration, active, createdAt, metadata) SELECT userId, guildId, moderatorId, 'WARN', reason || 'N/A', NULL, active, createdAt, json_build_object('points', points) FROM "Warning"`
3. Mettre à jour les 2 fichiers qui référencent `Warning` pour utiliser `Sanction` avec `type = 'WARN'`
4. Supprimer `Warning` du schéma
5. Migration Prisma

### Rollback

- Phase 1: `SELECT * INTO "WarningLog" FROM "Warning" WHERE points = 1 AND active = false`
- Phase 2: `SELECT * INTO "Warning" FROM "Sanction" WHERE type = 'WARN'` (extraire `points` depuis `metadata`)

---

## Validation requise

**Aucune migration ne sera exécutée tant que l'utilisateur n'a pas validé ce document.**
