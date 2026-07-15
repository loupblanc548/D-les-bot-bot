import paramiko

HOST = "31.220.79.90"
USER = "root"
PASS = "2Wn3dbQLN6D9Pfb"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)
print("Connecté !")

# Vérifier si Prometheus est déjà installé
stdin, stdout, stderr = ssh.exec_command("which prometheus 2>/dev/null; which grafana-server 2>/dev/null", timeout=10)
out = stdout.read().decode().strip()
print(f"Existing: {out or 'none'}")

if "prometheus" not in out:
    cmds = [
        # Install Prometheus
        "apt-get install -y prometheus prometheus-alertmanager 2>&1 | tail -5",
        # Configure Prometheus to scrape the bot
        """cat > /etc/prometheus/conf.d/discord-bot.yml << 'EOF'
scrape_configs:
  - job_name: 'discord-bot'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
EOF""",
        "systemctl restart prometheus",
        "systemctl is-active prometheus",
        # Install Grafana
        "apt-get install -y grafana 2>&1 | tail -5 || echo 'Grafana not in apt, skipping'",
        "systemctl enable grafana-server 2>/dev/null; systemctl start grafana-server 2>/dev/null; systemctl is-active grafana-server 2>/dev/null || echo 'grafana not installed'",
    ]
    for cmd in cmds:
        print(f"\n>>> {cmd[:80]}")
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out.strip():
            print(out.strip()[:500])
        if err.strip():
            print(f"[stderr] {err.strip()[:300]}")
else:
    print("Prometheus déjà installé")

# Test the metrics endpoint
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:3000/metrics | head -20", timeout=15)
out = stdout.read().decode()
print(f"\n=== Metrics endpoint test ===\n{out[:500]}")

ssh.close()
print("\n=== Prometheus config terminé ===")
