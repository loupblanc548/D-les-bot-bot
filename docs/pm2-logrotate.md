# pm2-logrotate — Configuration de la rotation des logs

## Installation

```bash
npm install -g pm2-logrotate
```

## Configuration automatique

Le script ci-dessous configure la rotation des logs pm2:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

## Effet

- Les logs de plus de **10MB** sont rotates automatiquement
- On garde **30 fichiers** d'historique max
- Les vieux logs sont **compresses** (gzip)
- Rotation verifiee toutes les **30 secondes**
- Rotation forcee a **minuit** chaque jour
