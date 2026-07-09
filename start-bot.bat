@echo off
cd /d "d:\les bot\bot"
node --expose-gc --max-old-space-size=4096 --import tsx src/index.ts
