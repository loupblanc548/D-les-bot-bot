---
description: "Workflow d'audit de sécurité — vulnérabilités, secrets, configuration"
---

# /security-audit

Workflow pour effectuer un audit de sécurité complet.

## Étapes

1. **Vulnérabilités** — `npm audit`, chercher les patterns dangereux (eval, exec, désérialisation)
2. **Secrets exposés** — Grep pour token/key/secret/password, vérifier .gitignore, vérifier les logs
3. **Mauvaises configurations** — CORS, rate limiting, whitelist, permissions Discord, Sentry, Docker
4. **Validation des entrées** — Vérifier l'utilisation de Zod sur toutes les entrées utilisateur
5. **API Discord** — Vérifier le token, les permissions, les intents

## Commandes

```bash
npm audit
npm audit --fix
npm run lint
```

## Skill associé

`.windsurf/skills/security-audit/SKILL.md`
