# Skill: security-audit

## Nom
Security Audit — Vulnérabilités, secrets exposés, mauvaises configurations

## Description
Audit de sécurité complet du bot Discord : recherche de vulnérabilités, secrets exposés, mauvaises configurations de sécurité.

## Quand l'utiliser
- Audit de sécurité périodique
- Avant une mise en production
- Après l'ajout de nouvelles fonctionnalités sensibles
- Réponse à une alerte de sécurité

## Déclencheurs
- "audit de sécurité"
- "security audit"
- "vulnérabilités"
- "secrets exposés"
- "sécurité"
- "security scan"

## Prérequis
- Accès complet au code source
- Fichier `.env` pour vérifier la configuration
- Comprendre les mécanismes de sécurité du bot (whitelist, rate limiting, anti-phishing)

## Étapes détaillées

### 1. Rechercher les vulnérabilités
- Lancer `npm audit` pour les vulnérabilités connues
- Vérifier les dépendances avec `npm outdated`
- Chercher les patterns dangereux dans le code :
  - `eval()`, `Function()` non justifiés
  - `child_process.exec` avec entrée utilisateur
  - Requêtes HTTP sans validation SSL
  - Désérialisation non sécurisée

### 2. Secrets exposés
- Vérifier qu'aucun secret n'est dans le code source (grep pour `token`, `key`, `secret`, `password`)
- Vérifier que `.env` est dans `.gitignore`
- Vérifier que `.env.example` ne contient pas de vraies valeurs
- Vérifier les logs Winston — aucun secret ne doit être loggé
- Vérifier les messages d'erreur envoyés à Discord — aucune stack trace en production

### 3. Mauvaises configurations
- Vérifier la configuration CORS si l'API backend est exposée
- Vérifier le rate limiting (`src/services/rateLimiter.ts`)
- Vérifier le middleware whitelist (`src/middleware/whitelist.ts`)
- Vérifier les permissions des commandes admin (OWNER_ID, roles)
- Vérifier la configuration Sentry (DSN, environment)
- Vérifier la configuration Docker (utilisateur non-root si possible)

### 4. Validation des entrées
- Vérifier l'utilisation de Zod pour toutes les entrées utilisateur
- Vérifier la validation des arguments de commandes Discord
- Vérifier la validation des URLs dans les sources surveillées
- Vérifier la protection contre l'injection dans les queries Prisma

### 5. API Discord
- Vérifier que le token Discord n'est jamais exposé
- Vérifier les permissions du bot (principe de moindre privilège)
- Vérifier la gestion des intents Discord

## Commandes exécutables
```bash
npm audit                       # Vulnérabilités npm
npm audit --fix                 # Corriger automatiquement
npm run lint                    # Lint (peut détecter des patterns dangereux)
npx tsc --noEmit                # Type check
```

## Vérifications finales
- [ ] Aucun secret dans le code source
- [ ] `npm audit` ne montre pas de vulnérabilités critiques
- [ ] Toutes les entrées utilisateur sont validées avec Zod
- [ ] Le rate limiting est actif
- [ ] Le whitelist middleware est configuré
- [ ] Les commandes admin vérifient les permissions
- [ ] Aucune stack trace envoyée à Discord en production

## Gestion des erreurs
- Si un secret est trouvé : le retirer immédiatement et le rotationner
- Si une vulnérabilité critique est trouvée : mettre à jour la dépendance immédiatement
- Si une mauvaise config est trouvée : corriger et documenter

## Bonnes pratiques
- Utiliser `npm audit` régulièrement
- Ne jamais logger de secrets avec Winston
- Toujours valider les entrées avec Zod avant traitement
- Utiliser les permissions Discord minimales nécessaires
- Garder le `.env` hors du contrôle de version
