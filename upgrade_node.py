import paramiko

HOST = "31.220.79.90"
USER = "root"
PASS = "2Wn3dbQLN6D9Pfb"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)
print("Connecté !")

cmds = [
    "node -v",
    "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
    "apt-get install -y nodejs",
    "node -v",
    "npm -v",
    "systemctl restart discord-bot",
    "systemctl is-active discord-bot",
]

for cmd in cmds:
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(f"[stderr] {err.strip()[:500]}")

print("\n=== Upgrade Node terminé ===")
ssh.close()
