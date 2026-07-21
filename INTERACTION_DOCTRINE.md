# INTERACTION_DOCTRINE.md — Doctrine d'interaction DM vs Serveur

## Principe fondamental

Les permissions d'un outil (`toolRiskRegistry.ts`) s'appliquent **identiquement en DM et sur serveur**. Il n'existe pas de traitement plus permissif en DM par défaut.

Un outil classé `restricted` ou `high` reste `restricted` ou `high` en DM — le SOAR gate, le rate-limiting et le circuit breaker s'appliquent de la même façon.

## Exceptions légitimes documentées

### 1. Threads automatiques (Point 3 — UX)
- **Inapplicable en DM** — les threads n'existent pas dans un canal privé.
- La suggestion de bascule en thread n'est proposée que sur serveur (`message.guildId` présent).

### 2. Réponse vocale (TTS)
- **Inapplicable en DM** — pas de salon vocal partagé en message privé.
- La réponse vocale n'est déclenchée que si `message.guildId && message.member?.voice?.channelId`.

### 3. Mention requise pour déclencher l'agent
- **Serveur** : l'agent ne répond qu'à une mention explicite ou un reply au bot.
- **DM** : l'agent répond à tous les messages (pas besoin de mention — déjà le cas dans `messages.ts`).

### 4. Outils spécifiques au serveur
- `enable_digest` / `disable_digest` — nécessitent un `guildId` (le digest est par serveur).
- `toolDiscordEvents` — nécessite un `guildId` (événements de serveur).
- `voice_translation` — nécessite un salon vocal (serveur uniquement).

### 5. Outils spécifiques au DM
- `generate_wifi_qr` — **DM-only par design** (protection des credentials réseau sensibles). Voir `agentToolsExtended.ts` — bloque explicitement si le canal n'est pas un DM.

## Vérification

Aucune condition trouvée dans le code qui rende un outil sensible plus permissif en DM qu sur serveur de façon non documentée. Les seules différences de comportement sont listées ci-dessus et sont toutes justifiées par des contraintes techniques (threads, vocal) ou de sécurité (wifi QR).

## Règle pour les futurs outils

Tout nouvel outil doit:
1. Être enregistré dans `toolRiskRegistry.ts` avec un niveau de risque.
2. Appliquer ce niveau identiquement en DM et sur serveur.
3. Si une exception DM/serveur est nécessaire, la documenter dans ce fichier avec justification.
