# IP Incident Response Runbook

## Immediate Actions

### 1. Investigate the IP

```bash
sudo bash scripts/ip_investigate.sh <SUSPICIOUS_IP>
```

Review the output in `/tmp/ip_audit_<IP>_*.txt`:

- WHOIS / geo location
- Auth log entries (failed/successful logins)
- Active connections
- fail2ban status

### 2. Block the IP (choose one)

**fail2ban (recommended, temporary):**

```bash
sudo fail2ban-client set sshd banip <IP>
```

**UFW (persistent):**

```bash
sudo ufw deny from <IP> to any
sudo ufw reload
```

**ipset + iptables (high-volume, performant):**

```bash
sudo ipset create blacklist hash:net -exist
sudo ipset add blacklist <IP>
sudo iptables -I INPUT -m set --match-set blacklist src -j DROP
```

### 3. Check for Compromise

```bash
# Successful logins from the IP
sudo grep "<IP>" /var/log/auth.log | grep "Accepted"

# New or unexpected SSH keys
sudo find /root /home -type f -name authorized_keys -print -exec sed -n '1,200p' {} \;

# Unexpected users
awk -F: '$3>=1000 && $3<65534 {print $1}' /etc/passwd

# Persistence mechanisms
sudo crontab -l 2>/dev/null
sudo ls /etc/cron.* -la
sudo systemctl list-timers --all
sudo find /tmp -maxdepth 2 -type f -mtime -7 -ls
```

### 4. If Compromise Detected

1. **Isolate**: Block the IP immediately
2. **Snapshot**: Take a VPS snapshot before further changes
3. **Rotate all secrets**:
   - `sudo passwd root`
   - Discord token: regenerate in Discord Developer Portal
   - Database credentials: rotate in Neon/Supabase dashboard
   - Telegram bot token: regenerate via BotFather
   - OpenRouter/Groq API keys: regenerate in respective dashboards
   - Update `.env` on VPS and restart bot
4. **Remove persistence**: Delete unauthorized SSH keys, cron jobs, systemd timers
5. **Audit**: Run `sudo bash scripts/server_audit.sh` and compare with baseline
6. **Report**: File abuse report with the IP's hosting provider

### 5. Post-Incident

- [ ] All secrets rotated
- [ ] Unauthorized access vectors closed
- [ ] fail2ban sensitivity increased if needed
- [ ] Server audit completed and reviewed
- [ ] Incident documented with timeline
- [ ] Monitoring alerts checked for related activity
- [ ] Team notified if applicable

## Prevention

- Keep fail2ban active with appropriate thresholds
- Use key-based SSH auth only (PasswordAuthentication no)
- Regular server audits (`scripts/server_audit.sh`)
- Monitor auth logs for brute-force patterns
- Consider geoblocking for high-risk regions
- Keep all packages updated (`unattended-upgrades`)
