# INFRA_HARDENING_STATUS.md — Statut du hardening infrastructure

**Date**: 2026-07-21

---

## 2.3.1 — 2FA sur les comptes GitHub

**Statut**: ⚠️ NON VÉRIFIABLE côté assistant
- L'utilisateur doit vérifier dans GitHub Settings → Authentication security
- Recommandation: 2FA TOTP (app) ou clé physique (WebAuthn) pour tous les comptes avec accès en écriture

## 2.3.2 — Protection de la branche `main`

**Statut**: ⚠️ NON VÉRIFIABLE côté assistant
- L'utilisateur doit configurer dans GitHub Settings → Branches → Branch protection rules
- Recommandations:
  - Require pull request reviews before merging (min 1 reviewer)
  - Require status checks to pass (CI)
  - Require branches to be up to date before merging
  - Do not allow bypassing the above settings
  - Restrict pushes that create matching branches

## 2.3.3 — Commits signés (GPG/SSH)

**Statut**: ❌ NON CONFIGURÉ
- Les commits récents (`git log --show-signature`) ne sont pas signés
- Recommandation: Configurer GPG signing ou SSH signing pour les commits touchant:
  - `src/services/agent*.ts` (logique d'agent)
  - `src/services/auth*.ts` (authentification)
  - `deploy*.sh` / `docker-compose*.yml` (déploiement)
  - `.env.example` / `config*.ts` (configuration)

## 2.3.4 — Isolation du compte de déploiement

**Statut**: ⚠️ NON VÉRIFIABLE
- Recommandation: Créer un compte GitHub dédié au déploiement VPS (read-only sur le repo)
- Le bot s'exécute avec ce compte, pas avec le compte principal de l'utilisateur
- Limite l'impact si le VPS est compromis

## 2.3.5 — Test de restauration depuis backup

**Statut**: ❌ JAMAIS CONFIRMÉ
- Recommandation: Effectuer un test réel:
  1. Récupérer le dernier backup S3
  2. Restaurer sur un environnement de test
  3. Vérifier l'intégrité des données (Prisma + fichiers)
  4. Démarrer le bot et vérifier le fonctionnement
  5. Documenter le résultat et le temps de restauration

## 2.3.6 — Immutabilité des backups S3

**Statut**: ⚠️ NON VÉRIFIABLE
- Vérifier que les credentials AWS/S3 utilisés pour le backup ont uniquement les permissions:
  - `s3:PutObject` (écrire)
  - `s3:GetObject` (lire)
  - **PAS** `s3:DeleteObject` (ne peut pas supprimer)
- Activer S3 Object Lock (WORM) ou versioning + MFA delete sur le bucket de backup
- Recommandation: Utiliser des IAM policies restrictives

---

## Résumé

| Point | Statut | Action requise par |
|-------|--------|-------------------|
| 2FA GitHub | ⚠️ Non vérifié | Utilisateur |
| Branch protection | ⚠️ Non vérifié | Utilisateur |
| Commits signés | ❌ Non configuré | Utilisateur + assistant |
| Isolation compte déploiement | ⚠️ Non vérifié | Utilisateur |
| Test de restauration | ❌ Jamais confirmé | Utilisateur |
| Immutabilité backups | ⚠️ Non vérifié | Utilisateur |

**Note**: Ces actions nécessitent un accès au panneau GitHub et au VPS. L'assistant ne peut pas les exécuter. Ce document sert de checklist pour l'utilisateur.
