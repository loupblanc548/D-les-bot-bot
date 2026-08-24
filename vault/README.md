# Bot Vault — Mémoire long-terme Obsidian

## Structure

```
vault/
  qa/              — Questions déjà posées + réponses, organisées par tiroirs
    gaming/        — Questions sur les jeux
    tech/          — Questions techniques (code, bugs, serveurs)
    web/           — Questions web (sites, recherches)
    osint/         — Questions OSINT/sécurité
    crypto/        — Questions crypto
    meteo/         — Questions météo
    discord/       — Questions Discord
    culture/       — Questions culture (films, séries, musique)
    science/       — Questions scientifiques
    quotidien/     — Questions vie quotidienne
    divers/        — Tout le reste
  users/           — Un fichier .md par utilisateur Discord (userId.md)
  knowledge/       — Notes libres écrites par toi, lues par le bot
  conversations/   — Résumés de conversations (écrits par le bot)
```

## Système Q&A ("tiroirs")

Quand un utilisateur pose une question et que le bot répond:

1. La question + réponse est sauvegardée dans `qa/<catégorie>/<slug>.md`
2. La catégorie est déterminée automatiquement par mots-clés
3. Si la même question est reposée plus tard, le bot retrouve l'ancienne réponse
4. Si la réponse change, une nouvelle version est ajoutée au fichier

### Format d'un fichier Q&A

```markdown
---
category: "gaming"
created: 2026-08-24
---

# Quelle est la meilleure arme dans Helldivers 2

## Question

Quelle est la meilleure arme dans Helldivers 2 ?

## Réponse

Le Breaker est actuellement considéré comme le meilleur fusil...

## Métadonnées

- Catégorie: **gaming**
- Date: 2026-08-24
- Source: conversation Discord
```

## Sync

1. Le bot écrit des Q&A automatiquement après chaque conversation
2. Tu édites les fichiers dans Obsidian sur ton PC
3. `git push` depuis ton PC → `git pull` sur le VPS (ou inversement)
