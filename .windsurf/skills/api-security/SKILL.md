# Skill: api-security

## Nom
API Security — Authentification, autorisations, injections, CORS, rate limiting

## Description
Audit et renforcement de la sécurité des APIs backend du bot Discord : authentification, autorisations, prévention des injections, CORS et rate limiting.

## Quand l'utiliser
- Audit de sécurité des routes backend
- Ajout d'authentification sur les endpoints
- Configuration CORS
- Renforcement du rate limiting

## Déclencheurs
- "api security"
- "sécurité api"
- "authentification"
- "cors"
- "rate limiting"
- "injection"

## Prérequis
- Comprendre les routes backend (`src/backend/routes/`)
- Comprendre le middleware (`src/backend/middleware/`, `src/middleware/`)
- Comprendre le rate limiter (`src/services/rateLimiter.ts`)

## Étapes détaillées

### 1. Authentification
- Vérifier si les endpoints nécessitent une authentification
- Ajouter un middleware d'authentification si nécessaire (token, API key)
- Vérifier que le token Discord n'est pas utilisé pour l'API web
- Considérer JWT ou session pour le dashboard

### 2. Autorisations
- Vérifier les permissions sur chaque endpoint
- Utiliser le whitelist middleware pour le contrôle d'accès
- Vérifier que les endpoints admin nécessitent OWNER_ID ou un rôle admin
- Implémenter le principe de moindre privilège

### 3. Injections
- Vérifier que toutes les queries Prisma sont paramétrées (pas de SQL raw non sécurisé)
- Vérifier que les entrées utilisateur sont validées avec Zod
- Vérifier qu'aucun `eval()` ou `Function()` n'est utilisé avec des entrées utilisateur
- Vérifier la prévention de command injection (child_process)

### 4. CORS
- Configurer CORS pour limiter les origines autorisées
- Ne pas utiliser `origin: '*'` en production
- Configurer les headers autorisés
- Configurer les méthodes autorisées

### 5. Rate limiting
- Vérifier que le rate limiter (`src/services/rateLimiter.ts`) est appliqué
- Configurer des limites par IP et par endpoint
- Utiliser Redis pour le rate limiting distribué
- Retourner des headers `X-RateLimit-*` informatifs

## Commandes exécutables
```bash
npm run lint                      # Lint (peut détecter des patterns dangereux)
npm test                          # Tests
curl -I http://localhost:3000/health  # Vérifier les headers de réponse
```

## Vérifications finales
- [ ] Les endpoints sensibles nécessitent une authentification
- [ ] Les autorisations sont vérifiées (whitelist, OWNER_ID)
- [ ] Aucune injection possible (Prisma paramétré, Zod validation)
- [ ] CORS est configuré (pas de `*` en production)
- [ ] Le rate limiting est actif
- [ ] Aucun secret dans les réponses API

## Gestion des erreurs
- Si une route n'est pas protégée : ajouter le middleware d'authentification
- Si CORS est trop permissif : restreindre les origines
- Si le rate limiting est absent : l'ajouter avec Redis

## Bonnes pratiques
- Ne jamais faire confiance aux entrées utilisateur (toujours valider avec Zod)
- Utiliser Prisma (paramétré) pour toutes les queries DB
- Configurer CORS de manière restrictive
- Appliquer le rate limiting sur tous les endpoints publics
- Logger les tentatives d'accès non autorisées
