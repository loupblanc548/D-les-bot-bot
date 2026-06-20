# Guide de Déploiement Railway via GitHub Actions

Ce guide configure un déploiement contrôlé de votre bot Discord "John Helldiver" sur Railway via GitHub Actions, remplaçant les déploiements automatiques par un workflow sécurisé et personnalisé.

---

## 📋 PHASE 1 - Configuration Préalable (Railway)

### 1.1 Désactiver les Déploiements Automatiques

1. Connectez-vous à votre compte [Railway](https://railway.app)
2. Sélectionnez votre projet **John Helldiver**
3. Cliquez sur l'onglet **Settings** (⚙️) en haut à droite
4. Dans la section **Deployments**, cliquez sur **Automatic Deployments**
5. Désactivez l'option **Deploy on Push**
6. Cliquez sur **Save Changes**

> ⚠️ **Important** : Cette étape empêche Railway de déployer automatiquement à chaque push, vous donnant le contrôle total via GitHub Actions.

### 1.2 Générer un Token d'API Railway

1. Cliquez sur votre avatar en haut à droite de Railway
2. Sélectionnez **Account Settings**
3. Dans le menu latéral, cliquez sur **API Tokens**
4. Cliquez sur **New Token**
5. Donnez un nom explicite (ex: `GitHub Actions Deploy`)
6. Sélectionnez les permissions minimales requises :
   - `Read` (pour lire le projet)
   - `Write` (pour déployer)
7. Cliquez sur **Create Token**
8. **COPIEZ IMMÉDIATEMENT** le token généré (il ne sera plus affiché après)

> 🔑 **Conservez ce token en sécurité** - il donne accès à votre compte Railway.

### 1.3 Récupérer le Project ID et Service ID

#### Project ID
1. Dans votre projet Railway, regardez l'URL dans votre navigateur
2. L'URL a ce format : `https://railway.app/project/PROJECT_ID`
3. Le **Project ID** est la chaîne de caractères après `/project/`
4. Exemple : `https://railway.app/project/abc123def456` → Project ID = `abc123def456`

#### Service ID
1. Dans votre projet, cliquez sur le service du bot Discord
2. Regardez l'URL : `https://railway.app/project/PROJECT_ID/service/SERVICE_ID`
3. Le **Service ID** est la chaîne après `/service/`
4. Exemple : `https://railway.app/project/abc123def456/service/xyz789` → Service ID = `xyz789`

> 📝 **Notez ces deux identifiants** - ils seront nécessaires pour la configuration GitHub.

---

## 🔐 PHASE 2 - Configuration des Secrets GitHub

### 2.1 Accéder au Menu Secrets

1. Allez sur votre dépôt GitHub
2. Cliquez sur l'onglet **Settings** (⚙️)
3. Dans le menu latéral, cliquez sur **Secrets and variables** → **Actions**
4. Cliquez sur **New repository secret**

### 2.2 Créer les Secrets Requis

Créez les trois secrets suivants avec les valeurs récupérées :

| Nom du Secret | Valeur à insérer |
|--------------|------------------|
| `RAILWAY_TOKEN` | Le token API Railway généré en Phase 1.2 |
| `RAILWAY_PROJECT_ID` | Le Project ID récupéré en Phase 1.3 |
| `RAILWAY_SERVICE_ID` | Le Service ID récupéré en Phase 1.3 |

**Pour chaque secret :**
1. Cliquez sur **New repository secret**
2. Dans **Name**, entrez le nom exact (ex: `RAILWAY_TOKEN`)
3. Dans **Secret**, collez la valeur correspondante
4. Cliquez sur **Add secret**

> ✅ **Vérification** : Vous devriez avoir 3 secrets listés dans la section "Repository secrets".

---

## 🚀 PHASE 3 - Workflow GitHub Actions

### 3.1 Structure du Fichier

Créez le fichier `.github/workflows/deploy.yml` à la racine de votre dépôt :

```
.github/
└── workflows/
    └── deploy.yml
```

### 3.2 Code du Workflow

Copiez ce contenu dans `deploy.yml` :

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

# Déclencheur : uniquement sur push vers la branche main
on:
  push:
    branches:
      - main

# Sécurité : uniquement pour l'auteur spécifié
# Remplacez MON_PSEUDO_GITHUB par votre nom d'utilisateur GitHub exact
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.actor == 'MON_PSEUDO_GITHUB'
    
    steps:
      # Étape 1 : Checkout du code source
      - name: Checkout code
        uses: actions/checkout@v4
      
      # Étape 2 : Installation de Node.js
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      # Étape 3 : Installation des dépendances
      - name: Install dependencies
        run: npm ci
      
      # Étape 4 : Installation de la Railway CLI
      - name: Install Railway CLI
        run: npm install -g @railway/cli
      
      # Étape 5 : Déploiement sur Railway
      - name: Deploy to Railway
        run: |
          railway login --token ${{ secrets.RAILWAY_TOKEN }}
          railway deploy --service ${{ secrets.RAILWAY_SERVICE_ID }} --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### 3.3 Personnalisation du Workflow

**IMPORTANT** : Remplacez `MON_PSEUDO_GITHUB` par votre nom d'utilisateur GitHub exact dans la ligne :

```yaml
if: github.actor == 'MON_PSEUDO_GITHUB'
```

Exemple : si votre pseudo est `loupblanc548`, la ligne devient :

```yaml
if: github.actor == 'loupblanc548'
```

---

## ✅ PHASE 4 - Test du Déploiement

### 4.1 Premier Test

1. Faites un petit changement dans votre code (ex: modifier un commentaire)
2. Committez et poussez sur la branche `main`
3. Allez sur l'onglet **Actions** de votre dépôt GitHub
4. Vous devriez voir le workflow "Deploy to Railway" en cours d'exécution

### 4.2 Vérification

Si tout est configuré correctement :
- ✅ Le workflow se lance automatiquement
- ✅ Les étapes s'exécutent successivement
- ✅ Railway reçoit le déploiement
- ✅ Le bot se redémarre avec les nouvelles modifications

### 4.3 En cas d'Erreur

Si le workflow échoue :
1. Cliquez sur le workflow en échec
2. Consultez les logs de chaque étape
3. Vérifiez que les secrets GitHub sont corrects
4. Vérifiez que le token Railway a les permissions nécessaires
5. Vérifiez que le Project ID et Service ID sont corrects

---

## 🔒 Sécurité Additionnelle (Optionnel)

### 5.1 Protection de Branche

Pour empêcher les pushes directs sur `main` :

1. Allez dans **Settings** → **Branches**
2. Cliquez sur **Add branch protection rule**
3. Configurez :
   - **Branch name pattern** : `main`
   - ✅ **Require a pull request before merging**
   - ✅ **Require status checks to pass before merging**
   - ✅ **Require branches to be up to date before merging**

### 5.2 Reviewers Obligatoires

Dans la même configuration :
- ✅ **Require approvals** : 1 reviewer
- Ajoutez votre compte comme reviewer obligatoire

---

## 📚 Références

- [Railway CLI Documentation](https://docs.railway.app/reference/cli)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Railway API Tokens](https://docs.railway.app/reference/authorization)

---

## ⏱️ Temps Estimé

Suivez ce guide pour verrouiller votre infrastructure de déploiement en **moins de 10 minutes**.

---

**Dernière mise à jour** : 20 Juin 2026
**Version** : 1.0
