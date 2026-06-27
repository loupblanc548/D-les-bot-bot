# Skill: ci-check

## Nom
CI Check — Reproduire localement la CI GitHub Actions

## Description
Reproduction locale du pipeline CI GitHub Actions défini dans `.github/workflows/ci.yml` pour valider que le code passera la CI avant de push.

## Quand l'utiliser
- Avant de push sur main/master
- Après des modifications importantes
- Déboguer un échec de CI
- Vérifier la compatibilité avec l'environnement CI

## Déclencheurs
- "ci check"
- "vérifier la CI"
- "reproduire la CI"
- "ci locale"
- "pipeline check"

## Prérequis
- Node.js 20+ (même version que la CI)
- PostgreSQL 16 (Docker ou local)
- Redis 7 (Docker ou local)
- Toutes les dépendances installées

## Étapes détaillées

### 1. Reproduire l'environnement CI
- Vérifier la version Node.js : `node --version` (doit être 20+)
- Démarrer PostgreSQL et Redis via Docker : `docker-compose up -d postgres redis`
- Vérifier la connexion DB : `pg_isready -U discord_bot`
- Vérifier la connexion Redis : `redis-cli ping`

### 2. Installer les dépendances (comme la CI)
```bash
npm ci
```
- Utiliser `npm ci` (comme la CI) au lieu de `npm install`

### 3. Générer Prisma (comme la CI)
```bash
npx prisma generate
npx prisma migrate deploy
```
- Utiliser `migrate deploy` (comme la CI), pas `migrate dev`

### 4. Exécuter les étapes CI dans l'ordre

#### 4.1 Formatage Prettier
```bash
npm run format:check
```

#### 4.2 Lint ESLint
```bash
npm run lint
```

#### 4.3 Type check TypeScript
```bash
npx tsc --noEmit
```

#### 4.4 Tests avec couverture
```bash
npm run test:ci
```

### 5. Vérifier le build Docker (optionnel)
```bash
docker build -t discord-bot-test .
```

### 6. Vérifier les tests E2E Playwright (optionnel)
```bash
npx playwright install --with-deps chromium
npx playwright test --reporter=list
```

## Commandes exécutables
```bash
npm ci                           # Installation propre (comme CI)
npx prisma generate              # Générer Prisma
npx prisma migrate deploy        # Appliquer les migrations
npm run format:check             # Prettier
npm run lint                     # ESLint
npx tsc --noEmit                 # TypeScript
npm run test:ci                  # Tests + couverture
docker build -t discord-bot-test .  # Build Docker
npx playwright test              # Tests E2E
```

## Vérifications finales
- [ ] `npm ci` réussit
- [ ] `npx prisma generate` réussit
- [ ] `npx prisma migrate deploy` réussit
- [ ] `npm run format:check` passe
- [ ] `npm run lint` passe
- [ ] `npx tsc --noEmit` passe
- [ ] `npm run test:ci` passe avec couverture >= seuils
- [ ] Le build Docker réussit (si testé)

## Gestion des erreurs
- Si `npm ci` échoue : vérifier `package-lock.json` — le regénérer avec `npm install`
- Si Prisma migrate échoue : vérifier l'état des migrations et la connexion DB
- Si les tests E2E échouent : vérifier les variables d'environnement (DISCORD_TOKEN, etc.)
- Si le build Docker échoue : vérifier le `Dockerfile` et le contexte de build

## Bonnes pratiques
- Utiliser `npm ci` et non `npm install` pour reproduire exactement la CI
- Utiliser `migrate deploy` et non `migrate dev` (la CI ne crée pas de nouvelles migrations)
- Vérifier la version Node.js exacte (20) pour éviter les divergences
- Si la CI échoue mais pas en local : vérifier les variables d'environnement et les services
