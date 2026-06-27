#!/bin/bash
# setup-logrotate.sh — Configure pm2-logrotate pour la rotation des logs
# Lancez: bash scripts/setup-logrotate.sh

set -e

echo "📦 Installation de pm2-logrotate..."
pm2 install pm2-logrotate

echo "⚙️ Configuration..."
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

echo "✅ pm2-logrotate configure !"
echo "   - Max size: 10MB par fichier"
echo "   - Retention: 30 fichiers"
echo "   - Compression: activee"
echo "   - Rotation: minuit chaque jour"
