# Skill: performance-analysis

## Nom
Performance Analysis — Identifier les ralentissements et proposer des optimisations

## Description
Analyse des performances du bot Discord : identification des goulots d'étranglement, des fuites mémoire, des requêtes lentes et proposition d'optimisations concrètes.

## Quand l'utiliser
- Le bot répond lentement aux commandes
- Utilisation mémoire élevée ou croissante
- Les cron jobs prennent trop de temps
- Les requêtes DB sont lentes
- Optimisation avant mise à l'échelle

## Déclencheurs
- "analyse de performance"
- "performance analysis"
- "lent"
- "slow"
- "optimiser"
- "optimize"
- "fuite mémoire"
- "memory leak"

## Prérequis
- Bot fonctionnel en local ou en production
- Accès aux métriques Prometheus (`src/services/` avec prom-client)
- Accès aux logs Winston
- PostgreSQL et Redis opérationnels

## Étapes détaillées

### 1. Identifier les ralentissements
- Vérifier les métriques Prometheus (latence, throughput)
- Analyser les logs Winston pour les temps de réponse lents
- Vérifier l'uptime et l'utilisation mémoire du process Node.js
- Identifier les commandes Discord avec le temps de réponse le plus élevé
- Vérifier les cron jobs qui dépassent leur intervalle

### 2. Analyser la base de données
- Vérifier les index Prisma dans `prisma/schema.prisma`
- Identifier les queries sans index (scan complet)
- Vérifier les N+1 queries (queries en boucle)
- Analyser les queries avec `EXPLAIN ANALYZE` dans PostgreSQL
- Vérifier la taille des tables et le nombre de lignes

### 3. Analyser le cache Redis
- Vérifier le hit/miss ratio du cache
- Identifier les appels API non mis en cache
- Vérifier les TTL du cache (trop courts = miss, trop longs = données stale)
- Vérifier l'utilisation de `node-cache` en complément de Redis

### 4. Analyser l'event loop Node.js
- Chercher les opérations synchrones bloquantes
- Vérifier l'utilisation correcte d'async/await
- Identifier les `Promise.all` manquants (opérations séquentielles qui pourraient être parallèles)
- Vérifier les timers et intervals non nettoyés

### 5. Proposer des optimisations
- Ajouter des index Prisma pour les colonnes fréquemment filtrées
- Mettre en cache les résultats d'API avec Redis
- Paralléliser les appels API indépendants avec `Promise.all`
- Optimiser les queries Prisma avec `select` au lieu de `include` complet
- Ajouter du pagination pour les grandes listes
- Nettoyer les listeners et timers inutiles

## Commandes exécutables
```bash
npm test                          # Tests de performance si existants
npx tsc --noEmit                  # Vérification des types
node -e "console.log(process.memoryUsage())"  # Snapshot mémoire
```

## Vérifications finales
- [ ] Les goulots d'étranglement sont identifiés
- [ ] Des optimisations concrètes sont proposées
- [ ] L'impact estimé de chaque optimisation est documenté
- [ ] Les optimisations ne cassent pas les tests existants

## Gestion des erreurs
- Si la DB est le goulot : vérifier les index et le pool de connexions Prisma
- Si Redis est le goulot : vérifier la connexion et la taille du cache
- Si l'API Discord est le goulot : vérifier le rate limiting et le cache
- Si l'event loop est bloqué : chercher les opérations synchrones

## Bonnes pratiques
- Mesurer avant d'optimiser (ne pas optimiser à l'aveugle)
- Optimiser le plus gros goulot d'abord
- Utiliser le cache Redis pour les données fréquemment lues et rarement modifiées
- Utiliser `select` dans Prisma pour ne récupérer que les colonnes nécessaires
- Surveiller l'utilisation mémoire avec les métriques Prometheus
