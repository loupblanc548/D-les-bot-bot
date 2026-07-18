# Module 7 Extension — WiFi & Network Defensive Audit

## Checklist de configuration (variables d'environnement)

Avant d'utiliser les nouveaux outils d'audit WiFi et réseau, l'opérateur doit définir les variables suivantes dans le fichier `.env` sur le VPS :

### Obligatoires

| Variable | Description | Exemple |
|---|---|---|
| `AUDIT_ALLOWED_CIDRS` | Plages CIDR autorisées pour les audits réseau (séparées par virgules) | `192.168.1.0/24,10.0.0.0/8` |
| `AUDIT_ALLOWED_SSID` | SSIDs WiFi autorisés pour les audits (séparés par virgules, sensibles à la casse) | `MyHomeWiFi` |
| `MY_VPS_IP` ou `VPS_IP` | IP publique du VPS (toujours incluse dans la whitelist) | `203.0.113.42` |
| `ADMIN_DISCORD_ID` | ID Discord de l'admin (pour les DM de validation SOAR + notifications de violation) | `123456789012345678` |

### Optionnelles

| Variable | Description | Défaut |
|---|---|---|
| `AGENT_SSH_ENABLED` | Active `ssh_command` | `false` |
| `AGENT_DOCKER_ENABLED` | Active `docker_manage` | `false` |
| `AGENT_GIT_ENABLED` | Active `git_operations` | `false` |

### Outils ajoutés (tous niveau `high` — validation admin obligatoire)

| Outil | Description | Outil Kali | Whitelist |
|---|---|---|---|
| `runWifiSecurityAudit` | Audit robustesse WPA2/WPA3 (handshake + offline test) | aircrack-ng | `AUDIT_ALLOWED_SSID` |
| `runWifiConfigScan` | Scan config AP (WPS, chiffrement, canal) | wifite | `AUDIT_ALLOWED_SSID` |
| `runRogueApDetection` | Détection passive Evil Twin / rogue AP | kismet | `AUDIT_ALLOWED_SSID` |
| `runArpScan` | Inventaire appareils réseau local | arp-scan | `AUDIT_ALLOWED_CIDRS` |
| `runArpWatch` | Surveillance continue nouveau appareil | arp-scan (loop) | `AUDIT_ALLOWED_CIDRS` |
| `runNetworkIdsSnapshot` | Lecture alertes IDS (suricata/zeek) | suricata/zeek logs | `AUDIT_ALLOWED_CIDRS` |
| `runSystemHardeningAudit` | Audit durcissement VPS (SSH, permissions, services) | lynis | `AUDIT_ALLOWED_CIDRS` |

### Explicitement exclu

- **Déauthentification WiFi** (`aireplay-ng --deauth`): Jamais implémenté. L'effet de bord (coupure réseau foyer entier) est disproportionné. Alternative: test en lab isolé.

### Architecture de sécurité

1. **Whitelist non contournable** (`killWhitelist.ts`): frozen au chargement, aucune API de mutation runtime
2. **Validation admin SOAR**: DM Discord avec bouton approbation (timeout 5 min)
3. **Context guard**: tous les outils Kali sont dans `RESTRICTED_TOOLS` — stripped en canal public
4. **Isolation Docker**: tous les outils s'exécutent via `docker exec kali-box` — le host n'est jamais touché
5. **Log des violations**: toute tentative hors whitelist est loggée + admin notifié par DM
6. **Pas de résolution DNS**: les hostnames sont rejetés par défaut (anti DNS rebinding)
7. **Normalisation IP**: defeat des encodages decimal/hex/octal/IPv6-mapped

### Exemple de log de refus (cible hors whitelist)

```
22:10:31 error: [WHITELIST-VIOLATION] SECURITY VIOLATION: Tool "runArpScan" attempted to target "8.8.8.8" — IP 8.8.8.8 not in any allowed CIDR: 192.168.1.0/24, 10.0.0.0/8, 127.0.0.0/8, ::1/128, 203.0.113.42. Invoked by: 123456789012345678
```

L'admin reçoit également un DM Discord:
```
🚨 [WHITELIST VIOLATION]
Tool: `runArpScan`
Target: `8.8.8.8`
Reason: IP 8.8.8.8 is not in the allowed audit whitelist
Invoked by: <@123456789012345678>
Time: 2026-07-18T22:10:31.000Z
```
