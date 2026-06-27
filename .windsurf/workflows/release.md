---
description: "Workflow de release — versioning, changelog, préparation production"
---

# /release

Workflow pour préparer et publier une release.

## Étapes

1. **Versioning** — Déterminer patch/minor/major, mettre à jour `package.json`
2. **Changelog** — `git log --oneline <last-tag>..HEAD`, catégoriser (Added/Changed/Fixed/Security)
3. **Vérifications** — `npm test`, `npm run build`, `npm run lint`, `npx tsc --noEmit`
4. **Tag** — `git tag -a v<version> -m "Release v<version>"` puis `git push origin v<version>`
5. **Post-release** — Vérifier la CI, l'image Docker, le déploiement

## Commandes

```bash
git log --oneline <last-tag>..HEAD
npm test
npm run build
npm run lint
npx tsc --noEmit
git tag -a v<version> -m "Release v<version>"
git push origin v<version>
```

## Skill associé

`.windsurf/skills/release/SKILL.md`
