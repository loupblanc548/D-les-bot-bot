#!/usr/bin/env bash
set -euo pipefail

# Server audit script — non-destructive, read-only checks.
# Usage: sudo bash scripts/server_audit.sh

OUT="/tmp/server-audit-$(date +%Y%m%d%H%M%S).txt"

echo "Server audit: $(hostname) — $(date)" > "$OUT"
echo "" >> "$OUT"

echo "== OS & Kernel ==" >> "$OUT"
uname -a >> "$OUT"
cat /etc/os-release >> "$OUT" 2>/dev/null || true
echo "" >> "$OUT"

echo "== SSH config ==" >> "$OUT"
grep -E '^(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication|PermitEmptyPasswords)' /etc/ssh/sshd_config >> "$OUT" 2>/dev/null || true
echo "" >> "$OUT"

echo "== UFW status ==" >> "$OUT"
ufw status verbose >> "$OUT" 2>/dev/null || echo "ufw not installed" >> "$OUT"
echo "" >> "$OUT"

echo "== fail2ban status ==" >> "$OUT"
fail2ban-client status >> "$OUT" 2>/dev/null || echo "fail2ban not active" >> "$OUT"
fail2ban-client status sshd >> "$OUT" 2>/dev/null || true
echo "" >> "$OUT"

echo "== Active services ==" >> "$OUT"
systemctl list-units --type=service --state=running >> "$OUT"
echo "" >> "$OUT"

echo "== Sudoers (non-system users) ==" >> "$OUT"
awk -F: '$3>=1000 && $3<65534 {print $1}' /etc/passwd | sort >> "$OUT"
echo "" >> "$OUT"

echo "== Open ports ==" >> "$OUT"
ss -tulpen >> "$OUT" 2>/dev/null || true
echo "" >> "$OUT"

echo "== Recent auth logs (last 200 lines) ==" >> "$OUT"
tail -n 200 /var/log/auth.log >> "$OUT" 2>/dev/null || true
echo "" >> "$OUT"

echo "== Crontab (root) ==" >> "$OUT"
crontab -l >> "$OUT" 2>/dev/null || echo "no crontab" >> "$OUT"
echo "" >> "$OUT"

echo "== System timers ==" >> "$OUT"
systemctl list-timers --all >> "$OUT"
echo "" >> "$OUT"

echo "== Disk usage ==" >> "$OUT"
df -h >> "$OUT"
echo "" >> "$OUT"

echo "== Memory ==" >> "$OUT"
free -h >> "$OUT"
echo "" >> "$OUT"

echo "== AIDE / FIM check ==" >> "$OUT"
which aide >> "$OUT" 2>/dev/null && echo "AIDE installed" >> "$OUT" || echo "AIDE not installed (recommended)" >> "$OUT"
echo "" >> "$OUT"

echo "== unattended-upgrades ==" >> "$OUT"
dpkg -l unattended-upgrades >> "$OUT" 2>/dev/null || echo "not installed" >> "$OUT"
echo "" >> "$OUT"

echo "Audit written to $OUT"
echo "----"
cat "$OUT"
