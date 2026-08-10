#!/usr/bin/env bash
set -euo pipefail

# IP investigation script — audit, block, and report on a suspicious IP.
# Usage: sudo bash scripts/ip_investigate.sh <ip>
# Non-destructive by default. Blocking requires explicit flag.

IP="${1:-}"
if [ -z "$IP" ]; then
  echo "Usage: $0 <ip>"
  exit 1
fi

OUT="/tmp/ip_audit_${IP}_$(date +%Y%m%d%H%M%S).txt"

echo "=== IP Audit: $IP — $(date) ===" > "$OUT"
echo "" >> "$OUT"

echo "== WHOIS ==" >> "$OUT"
whois "$IP" 2>/dev/null >> "$OUT" || echo "whois not available" >> "$OUT"
echo "" >> "$OUT"

echo "== Geo/IPInfo ==" >> "$OUT"
curl -sS "https://ipinfo.io/${IP}/json" >> "$OUT" 2>/dev/null || echo "ipinfo unavailable" >> "$OUT"
echo "" >> "$OUT"

echo "== Reverse DNS ==" >> "$OUT"
dig -x "$IP" +short >> "$OUT" 2>/dev/null || echo "dig not available" >> "$OUT"
echo "" >> "$OUT"

echo "== Auth logs (last 500 lines matching IP) ==" >> "$OUT"
grep "$IP" /var/log/auth.log /var/log/auth.log.* 2>/dev/null | tail -n 500 >> "$OUT" || echo "no auth log matches" >> "$OUT"
echo "" >> "$OUT"

echo "== Accepted connections from IP ==" >> "$OUT"
grep "$IP" /var/log/auth.log 2>/dev/null | grep "Accepted" >> "$OUT" || echo "no accepted connections" >> "$OUT"
echo "" >> "$OUT"

echo "== fail2ban status (sshd) ==" >> "$OUT"
fail2ban-client status sshd 2>/dev/null >> "$OUT" || echo "fail2ban not active" >> "$OUT"
fail2ban-client get sshd banned 2>/dev/null >> "$OUT" || true
echo "" >> "$OUT"

echo "== Active connections from IP ==" >> "$OUT"
ss -tunap 2>/dev/null | grep "$IP" >> "$OUT" || echo "no active connections" >> "$OUT"
echo "" >> "$OUT"

echo "== Quick port scan ==" >> "$OUT"
nmap -Pn -sS -T4 -p 22,80,443,8080,8443 "$IP" 2>/dev/null >> "$OUT" || echo "nmap not available" >> "$OUT"
echo "" >> "$OUT"

echo "=== Audit saved: $OUT ===" >> "$OUT"
echo ""
cat "$OUT"
echo ""
echo "=== To block this IP, run one of: ==="
echo "  sudo fail2ban-client set sshd banip $IP"
echo "  sudo ufw deny from $IP to any && sudo ufw reload"
echo "  sudo ipset create blacklist hash:net -exist && sudo ipset add blacklist $IP && sudo iptables -I INPUT -m set --match-set blacklist src -j DROP"
