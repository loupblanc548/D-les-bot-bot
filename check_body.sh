#!/bin/bash
sshpass -p 'Si62u1j55exIO8' ssh -o StrictHostKeyChecking=no root@31.220.79.90 'curl -s http://localhost:3000/releases/showcase 2>/dev/null | wc -c && curl -s http://localhost:3000/releases/showcase 2>/dev/null > /tmp/test_page.html && grep "background" /tmp/test_page.html | head -3'
