#!/bin/bash
for user in root admin ubuntu user; do
  echo "Testing $user..."
  sshpass -p 'x1KHn55ck93vhB' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 $user@31.220.79.90 "echo OK" 2>&1
done
