# Bot Vault — Mémoire long-terme Obsidian

## Structure

```
vault/
  users/          — Un fichier .md par utilisateur Discord (userId.md)
  knowledge/      — Notes libres écrites par toi, lues par le bot
  conversations/  — Résumés de conversations (écrits par le bot)
```

## Format fichier utilisateur (`users/<userId>.md`)

```markdown
---
userId: "123456789"
username: "JohnDoe"
created: 2026-08-24
updated: 2026-08-24
---

# JohnDoe

## Faits

- **jeu préféré**: Helldivers 2 #game
- **langue**: français #preference

## Notes

Tes notes libres ici. Le bot les lira comme contexte.
```

## Sync

1. Le bot écrit des faits automatiquement après chaque conversation
2. Tu édites les fichiers dans Obsidian sur ton PC
3. `git push` depuis ton PC → `git pull` sur le VPS (ou inversement)

## Knowledge base (`knowledge/*.md`)

Crée n'importe quel fichier `.md` dans `knowledge/`. Le bot le recherchera
par mots-clés quand une question correspond.
