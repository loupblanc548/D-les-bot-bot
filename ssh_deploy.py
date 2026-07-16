import paramiko
import sys
import time

HOST = "31.220.79.90"
USER = "root"
PASS = "vGW5J68bRhAd"
CMD = "cd /opt/discord-bot && bash deploy/update.sh"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

def keyboard_interactive_handler(title, instructions, prompt_list):
    return [PASS for _ in prompt_list]

try:
    print(f"Connexion SSH à {USER}@{HOST}...")
    
    # Try password auth first
    try:
        ssh.connect(HOST, username=USER, password=PASS, timeout=15, look_for_keys=False, allow_agent=False)
    except paramiko.AuthenticationException:
        print("Auth par mot de passe échouée, essai keyboard-interactive...")
        transport = paramiko.Transport((HOST, 22))
        transport.connect()
        transport.auth_interactive(USER, keyboard_interactive_handler)
        ssh._transport = transport
    
    print("Connecté ! Exécution du script de mise à jour...\n")
    
    stdin, stdout, stderr = ssh.exec_command(CMD, timeout=120)
    
    # Stream output in real-time
    while True:
        line = stdout.readline()
        if not line and stdout.channel.exit_status_ready():
            break
        if line:
            print(line.rstrip())
        time.sleep(0.01)
    
    err_output = stderr.read().decode()
    if err_output:
        print("\n--- STDERR ---")
        print(err_output)
    
    exit_code = stdout.channel.recv_exit_status()
    print(f"\nExit code: {exit_code}")
    
except Exception as e:
    print(f"Erreur: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    ssh.close()
