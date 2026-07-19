# VPS AUDIT REPORT — 19/07/2026

## Environnement

- **VPS**: Contabo VMI (KVM/QEMU), Ubuntu 24.04.4 LTS, Kernel 6.8.0-134
- **Disk**: 145GB (12% used, 128GB free)
- **RAM**: ~8GB (bot utilise 1.0GB, max 6.0G via systemd)
- **Bot**: systemd service `discord-bot.service` — active, `/opt/discord-bot/dist/index.js`
- **PM2**: installé mais inactif (bot géré par systemd)
- **Prometheus**: actif (port 9090 + node-exporter 9100)

---

## 🔴 CRITIQUE — Sécurité

### 1. UFW désactivé
```
Status: inactive
```
**Aucun firewall actif.** Tous les ports exposés sont accessibles depuis Internet.

**Ports exposés sur 0.0.0.0 (Internet)**:
- `22` — SSH (sshd)
- `3000` — Bot control server
- `3002` — Bot (autre service)
- `3005` — Metrics
- `3006` — Bot (autre service)
- `631` — CUPS (imprimante — inutile sur un serveur)
- `9090` — Prometheus (dashboard non protégé)
- `9100` — Node exporter (métriques système exposées)

**Action immédiate**:
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 3000/tcp  # bot control — ou restreindre à localhost + reverse proxy
ufw allow 3005/tcp  # metrics — restreindre à localhost
ufw allow 3006/tcp  # bot — restreindre à localhost
ufw deny 3002/tcp   # exposer uniquement si nécessaire
ufw deny 631/tcp    # CUPS — désactiver le service
ufw deny 9090/tcp   # Prometheus — bind localhost uniquement
ufw deny 9100/tcp   # Node exporter — bind localhost uniquement
ufw enable
```

### 2. SSH — root login avec mot de passe
```
PermitRootLogin yes
PasswordAuthentication (non désactivé)
0 authorized_keys
```
**Root login par mot de passe activé, aucune clé SSH configurée.**

**Action immédiate**:
1. Générer une clé SSH localement et l'ajouter:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/contabo_bot
ssh-copy-id -i ~/.ssh/contabo_bot.pub root@31.220.79.90
```
2. Durcir `/etc/ssh/sshd_config`:
```
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
```
3. Redémarrer SSH: `systemctl restart sshd`

### 3. Fail2ban inactif
```
inactive
```
**Aucune protection contre le brute-force SSH.**

**Action**:
```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

### 4. Redis — non visible mais config à vérifier
Redis n'écoute pas sur le VPS directement (pas de port 6379). Vérifier si Redis tourne dans un conteneur ou si le bot utilise Redis distant (Neon/Upstash). Le `.env` contient `REDIS_URL` — vérifier sa valeur.

### 5. Ports bot exposés sans authentification
Les ports 3000, 3002, 3005, 3006 sont accessibles depuis Internet. Le port 3000 (control server) a une authentification (`CONTROL_TOKEN`), mais les autres peuvent ne pas en avoir.

**Action**: Restreindre tous les ports bot à localhost + utiliser un reverse proxy (Nginx) avec authentification pour l'accès externe.

---

## 🟡 MODÉRÉ

### 6. Prometheus exposé sans auth
Port 9090 et 9100 accessibles depuis Internet — métriques système visibles publiquement.

**Action**: `ufw deny 9090/tcp; ufw deny 9100/tcp` ou binder Prometheus sur localhost.

### 7. CUPS actif
Port 631 (CUPS) — service d'impression inutile sur un serveur.

**Action**: `systemctl disable cups; systemctl stop cups`

### 8. Pas de backups S3 configurés
Aucun répertoire de backup sur le VPS. `DATABASE_URL` pointe vers une base distante (probablement Neon). Pas de config S3/AWS dans le `.env`.

**Action**: 
- Vérifier si Neon fait des backups automatiques (oui, par défaut)
- Configurer un backup quotidien de la base: `pg_dump` → S3/Backblaze
- Tester la restauration

### 9. Pas de snapshots Contabo
Aucun mount de backup visible. Contabo propose des snapshots payants — vérifier si l'option est activée dans le panel Contabo.

---

## 🟢 OK

- **Bot**: systemd service actif, redémarrage automatique configuré
- **Mémoire**: limitée à 6GB via systemd (MemoryMax)
- **GC**: `--expose-gc --max-old-space-size=4096` — bien configuré
- **Disk**: 12% utilisé, 128GB libres
- **OS**: Ubuntu 24.04 LTS à jour

---

## Checklist actions prioritaires

| # | Priorité | Action | Commande |
|---|----------|--------|----------|
| 1 | 🔴 CRITIQUE | Activer UFW | `ufw enable` + règles |
| 2 | 🔴 CRITIQUE | SSH clé uniquement | Ajouter clé + `PermitRootLogin prohibit-password` |
| 3 | 🔴 CRITIQUE | Activer fail2ban | `apt install fail2ban && systemctl enable fail2ban` |
| 4 | 🔴 CRITIQUE | Fermer ports exposés | `ufw deny 3002,631,9090,9100` |
| 5 | 🟡 | Désactiver CUPS | `systemctl disable cups` |
| 6 | 🟡 | Binder Prometheus sur localhost | Éditer `prometheus.yml` |
| 7 | 🟡 | Configurer backups DB | `pg_dump` cron → S3 |
| 8 | 🟡 | Vérifier snapshots Contabo | Panel Contabo |
| 9 | 🟡 | Créer `INCIDENT_RESPONSE.md` | Documenter procédure |
| 10 | 🟡 | 2FA GitHub + protection branche `main` | Settings GitHub |
