# Litestream — Réplication SQLite en temps réel

## Qu'est-ce que Litestream ?

Litestream est un outil qui réplique une base SQLite vers un stockage S3-compatible
en temps réel. Permet un recovery quasi-instantané en cas de crash.

## Installation

### Linux (serveur)
```bash
wget https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz
tar xzf litestream-v0.3.13-linux-amd64.tar.gz
sudo mv litestream /usr/local/bin/
```

### Windows
Télécharger depuis https://github.com/benbjohnson/litestream/releases

## Configuration

Créer `litestream.yml` à la racine du projet:

```yaml
dbs:
  - path: ./prisma/dev.db  # ou le chemin de votre SQLite
    replicas:
      - url: s3://my-bucket/db-replica
        # Pour Backblaze B2:
        # - url: b2://my-bucket/db-replica
        # Pour Google Drive:
        # - url: gdrive://my-bucket/db-replica
        sync-interval: 1s
```

## Variables d'environnement (.env)

```env
LITESTREAM_S3_ACCESS_KEY_ID=your-key
LITESTREAM_S3_SECRET_ACCESS_KEY=your-secret
LITESTREAM_S3_BUCKET=your-bucket
LITESTREAM_S3_REGION=eu-west-1
```

## Démarrage

```bash
# En arrière-plan (remplace le démarrage direct du bot)
litestream replicate -config litestream.yml

# Recovery après crash
litestream restore -config litestream.yml -o ./prisma/dev.db
```

## Avec pm2

```bash
pm2 start "litestream replicate -config litestream.yml" --name litestream
pm2 start "npx tsx src/index.ts" --name john-helldiver
```

## Avantages

- **RPO ~1 seconde**: perte de données maximale en cas de crash
- **Gratuit**: Litestream est open-source
- **Coût stockage minimal**: S3/B2 coûte ~0.005$/GB/mois
- **Pas de changement de code**: fonctionne au niveau fichier
