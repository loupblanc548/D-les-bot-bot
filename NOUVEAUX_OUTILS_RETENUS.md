# NOUVEAUX_OUTILS_RETENUS.md — Filtrage des candidats (Partie A.1)

> Date: 2026-07-18
> Catalogue actuel: ~173 outils (7 modules)
> Plafond cible après dédup + extension: 160-180 outils

---

## Méthodologie de filtrage

Chaque candidat de la Section A.3 a été évalué contre 3 filtres:
1. **Redondance**: un outil existant fait-il déjà la même chose?
2. **Niveau de risque**: coût financier, effet irréversible, données personnelles?
3. **Usage réel probable**: existe-t-il une demande mesurable?

---

## Candidats REJETÉS (avec justification)

| Candidat | Raison du rejet |
|---|---|
| **Google Calendar API** | Redondant avec `ScheduledMessage` + `Reminder` (Prisma) qui gèrent déjà événements/rappels Discord. L'ajout d'un calendrier Google externe ajoute une dépendance OAuth2 complexe pour un gain marginal. |
| **Notion API / Todoist API** | Cas d'usage community task management non observé dans les logs. `ScheduledMessage` + `Reminder` couvrent le besoin de suivi. Ajout prématuré sans demande mesurable. |
| **Google Sheets API** | Export de rapports — `data-export` (CSV/JSON) existe déjà via `agentTools.ts`. L'export Google Sheets ajoute une dépendance OAuth2 pour un format de sortie. |
| **Alpha Vantage / Finnhub** | `getStockPrice` (Extended) utilise déjà Stooq (gratuit, pas de clé). Alpha Vantage est déjà utilisé par `get_stock_price` (Free) — c'est un doublon à supprimer, pas un ajout. Finnhub nécessite une clé pour des features premium non justifiées. |
| **Stripe / Ko-fi / Patreon** | Aucun volet financement participatif observé. Ajout prématuré sans cas d'usage. |
| **Frankfurter API** | `getCurrencyRate` (Extended) utilise déjà exchangerate.host (gratuit, pas de clé). Frankfurter est une API similaire — redondance exacte. |
| **ElevenLabs TTS** | `generate_tts` (Free) utilise StreamElements (gratuit). ElevenLabs est payant ($5/mois minimum). Le gain de qualité ne justifie pas le coût récurrent sans demande mesurable. |
| **Remove.bg** | Service payant. `generate_image` (Free) via Pollinations.ai couvre la création d'images. La suppression de fond est un cas d'usage niche non observé. |
| **Cloudinary** | Service payant avec tier gratuit limité. `imageService.ts` existe déjà pour le traitement d'images. Redondance + coût. |
| **RAWG API** | `rawgClient.ts` existe **déjà** dans le codebase avec cache, retry, dédup. Pas exposé comme tool agent — c'est un **wrapping** à faire, pas un ajout net. Voir ci-dessous. |
| **SendGrid / Resend** | `alertDispatcher.ts` supporte **déjà** SendGrid + SMTP pour l'email transactionnel. Pas besoin d'un nouvel outil — c'est un canal existant non exposé comme tool agent. |

---

## Candidats RETENUS (à implémenter)

| # | Nom de l'outil | Module cible | API sous-jacente | Remplace/complète | Niveau de risque | Justification |
|---|---|---|---|---|---|---|
| 1 | `checkDataBreach` | Autonomous | Have I Been Pwned (`hibp.ts` déjà présent) | **Nouveau** — aucun tool existant ne vérifie les fuites de données | `medium` | `hibp.ts` est déjà codé et fonctionnel mais **pas exposé** comme tool agent. L'OSINT scan (`osint_scan`) ne couvre pas les breaches email. Cas d'usage clair: "mon email est-il dans une fuite ?" |
| 2 | `scanUrlSafety` | Autonomous | urlscan.io API | **Complète** `verify_link_safety` (URLVoid) — urlscan.io donne un rapport plus détaillé (redirects, JS, screenshots) | `low` | Renforce la défense anti-injection de prompt: scanner une URL avant `readUrl`/`fetchAndSummarize`. urlscan.io a un tier gratuit (100 scans/jour). Double source de réputation (URLVoid + urlscan.io). |
| 3 | `solveMathAdvanced` | Extended | Wolfram Alpha API | **Remplace** `solveMath` (évaluateur d'expression local) | `low` | `solveMath` est limité à des expressions arithmétiques simples. Wolfram Alpha gère: calcul symbolique, dérivées, intégrales, équations, conversions d'unités, chimie, physique. Wolfram a un tier gratuit (2000 requêtes/mois non-commercial). `solveMath` sera supprimé. |
| 4 | `translateTextDeepL` | Extended | DeepL API (`deepl.ts` déjà présent) | **Remplace** `translateText` (MyMemory) | `low` | `deepl.ts` est déjà codé et configuré (`DEEPL_API_KEY`). DeepL est nettement supérieur à MyMemory pour le français/européen. `translateText` (MyMemory) sera supprimé. Plan gratuit: 500k chars/mois. |
| 5 | `getAirQuality` | Extra | OpenAQ API v3 | **Nouveau** — complète `get_weather_forecast` (Open-Meteo) | `low` | Aucun outil existant ne couvre la qualité de l'air. OpenAQ est gratuit, pas de clé. Cas d'usage: "est-ce que je peux sortir aujourd'hui ?" combiné avec météo. |
| 6 | `searchRawgGames` | Extra | RAWG API (`rawgClient.ts` déjà présent) | **Complète** `search_igdb_games` — RAWG a 350k+ jeux vs IGDB ~200k | `low` | `rawgClient.ts` est déjà codé avec cache/retry mais **pas exposé** comme tool agent. RAWG est gratuit, pas de clé requise. Double source de données jeux (IGDB + RAWG). |
| 7 | `sendAlertEmail` | External | SendGrid/SMTP (`alertDispatcher.ts` déjà présent) | **Nouveau** — expose l'email comme canal agent | `high` | `alertDispatcher.ts` supporte déjà SendGrid + SMTP mais n'est pas callable par l'agent. Utile pour alertes admin critiques indépendantes de Discord. **High risk**: peut envoyer des emails à des destinataires — passe par SOAR gate. |

---

## Bilan net (respect du plafond A.2)

| Action | Count |
|---|---|
| Ajouts nets | 7 nouveaux outils |
| Suppressions (doublons) | 2 (`solveMath`, `translateText` MyMemory) |
| Wrapping d'existant non exposé | 3 (`hibp.ts`, `deepl.ts`, `rawgClient.ts`) |
| **Solde net** | **+5 outils** (173 → 178) |

Le solde net de +5 est cohérent avec le plafond de 160-180 outils après dédup des 12 paires identifiées dans l'AUDIT.md (qui ramènerait le total à ~161 + 5 = 166).

---

## Variables d'environnement requises

| Variable | Outil(s) | Obligatoire? | Notes |
|---|---|---|---|
| `HIBP_API_KEY` | `checkDataBreach` | Oui | Obtenir sur haveibeenpwned.com |
| `URLSCAN_API_KEY` | `scanUrlSafety` | Non (tier sans clé: 100/jour) | Optionnel pour quota plus élevé |
| `WOLFRAM_APP_ID` | `solveMathAdvanced` | Oui | Obtenir sur wolframalpha.com |
| `DEEPL_API_KEY` | `translateTextDeepL` | Oui | Déjà utilisé par `deepl.ts` |
| (aucune) | `getAirQuality` | — | OpenAQ est gratuit sans clé |
| `RAWG_API_KEY` | `searchRawgGames` | Non (fonctionne sans mais limité) | Déjà utilisé par `rawgClient.ts` |
| `SENDGRID_API_KEY` ou `SMTP_URL` | `sendAlertEmail` | Oui (l'un ou l'autre) | Déjà utilisé par `alertDispatcher.ts` |

---

## Outils à SUPPRIMER (compensation A.2)

| Outil supprimé | Module | Raison | Remplacé par |
|---|---|---|---|
| `solveMath` | Extended | Évaluateur local limité, pas de calcul symbolique | `solveMathAdvanced` (Wolfram Alpha) |
| `translateText` | Core (agentTools.ts) | MyMemory = qualité faible, déjà remplacé par DeepL dans `deepl.ts` | `translateTextDeepL` (DeepL) |
| `get_stock_price` | Free | Doublon exact de `getStockPrice` (Extended), utilise Alpha Vantage (clé requise) vs Stooq (gratuit) | `getStockPrice` (Extended) — déjà existant |
| `get_urban_dict` | Free | Doublon de `getUrbanDict` (Extended) + `scrape_urban_slang` (Autonomous) | `getUrbanDict` (Extended) |

**Total suppressions: 4 outils** → solde net réel: +7 ajouts - 4 suppressions = **+3 outils** (173 → 176)
