#!/usr/bin/env bash
set -euo pipefail

SCENARIO="${1:-all}"
CONTAINER="${BOT_CONTAINER:-discord-bot}"

echo "🔥 Chaos test: $SCENARIO"

case "$SCENARIO" in
  kill-ollama)
    echo "→ Killing Ollama process..."
    ssh root@${VPS_HOST:-31.220.79.90} "pkill -f ollama || true"
    sleep 5
    echo "→ Checking bot fallback..."
    docker logs --tail 20 "$CONTAINER" 2>&1 | grep -i "fallback\|LLM" || true
    echo "→ Restarting Ollama..."
    ssh root@${VPS_HOST:-31.220.79.90} "systemctl start ollama"
    ;;

  disconnect-db)
    echo "→ Simulating DB disconnect..."
    docker exec "$CONTAINER" sh -c 'kill -STOP $(pgrep -f prisma 2>/dev/null | head -1) 2>/dev/null || true' || true
    sleep 10
    echo "→ Checking bot resilience..."
    docker logs --tail 20 "$CONTAINER" 2>&1 | grep -i "database\|prisma\|reconnect" || true
    docker exec "$CONTAINER" sh -c 'kill -CONT $(pgrep -f prisma 2>/dev/null | head -1) 2>/dev/null || true' || true
    ;;

  network-latency)
    echo "→ Adding 500ms network latency..."
    docker exec "$CONTAINER" sh -c 'tc qdisc add dev eth0 root netem delay 500ms 2>/dev/null || true' || true
    sleep 30
    echo "→ Checking bot behavior..."
    docker logs --tail 20 "$CONTAINER" 2>&1 | grep -i "timeout\|retry\|error" || true
    docker exec "$CONTAINER" sh -c 'tc qdisc del dev eth0 root 2>/dev/null || true' || true
    ;;

  memory-pressure)
    echo "→ Simulating memory pressure..."
    docker exec "$CONTAINER" sh -c 'stress --vm 1 --vm-bytes 400M --timeout 30s 2>/dev/null || python3 -c "import sys; x=[b\"\x00\"*400*1024*1024]; sys.stdin.read(1)" &>/dev/null &' || true
    sleep 30
    echo "→ Checking OOM behavior..."
    docker logs --tail 20 "$CONTAINER" 2>&1 | grep -i "memory\|oom\|gc" || true
    ;;

  all)
    echo "→ Running all chaos scenarios..."
    "$0" kill-ollama
    "$0" disconnect-db
    "$0" network-latency
    "$0" memory-pressure
    echo "→ All chaos tests completed"
    ;;

  *)
    echo "Usage: $0 {kill-ollama|disconnect-db|network-latency|memory-pressure|all}"
    exit 1
    ;;
esac

echo "✅ Chaos test completed: $SCENARIO"
