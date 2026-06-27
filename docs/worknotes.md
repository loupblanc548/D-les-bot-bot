# Bot Discord — Notes de travail

## Contexte projet
- Bot Discord "John Helldiver" — surveillance, modération, gaming, IA
- Stack : TypeScript, Node.js, Discord.js 14, Prisma (PostgreSQL Neon), Redis, OpenRouter
- Déploiement : PM2 local (Windows), Railway/Docker pour prod
- Branche active : `feat/architecture-refactor-advanced-ai`

## Architecture IA
- `src/services/aiConversation.ts` — gestionnaire conversations temporaires (10 min timeout)
- `src/services/aiMemory.ts` — mémoire long-terme (facts, messages, summary)
- `src/events/messages.ts` — handler `handleAiChatMention` (@bot)
- Modèles gratuits OpenRouter :
  - Conversation : `nvidia/nemotron-3-ultra-550b-a55b:free`
  - Extraction faits/liens : `meta-llama/llama-3.2-3b-instruct:free`

## Graphe de connaissances (style Obsidian)
- Modèle Prisma `MemoryLink` : source → target + relation + strength
- Extraction automatique à la fin de chaque conversation
- Liens inclus dans le contexte IA via `getLinksContext()`
- Upsert avec incrément de strength (0.5) pour les liens répétés

## Modération
- Word filter 4 niveaux (1 min window) : silent delete → warn → timeout 10min → ban
- DM + log salon à chaque niveau ≥ 2
- Modèle `WordFilterInfraction` en DB

## Sécurité
- `npm audit` : 0 vulnérabilités (override undici ^8.5.0)
- SSL PostgreSQL : `rejectUnauthorized: true`
- `.env` : permissions restreintes (lecture seule utilisateur)
- CI/CD : workflow `security-audit.yml` (npm audit + eslint-plugin-security)

## TODO / Améliorations possibles
- [ ] Commande admin pour visualiser le graphe de connaissances d'un utilisateur
- [ ] Decay des liens (réduire strength si non refresh)
- [ ] Pruning des liens avec strength < seuil
- [ ] Migration discord.js v15 quand stable
- [ ] Tests pour aiConversation.ts (extraction faits + liens)
