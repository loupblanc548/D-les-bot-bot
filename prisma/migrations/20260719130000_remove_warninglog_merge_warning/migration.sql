-- Migration: Remove WarningLog model, merge Warning into Sanction
-- WarningLog was only used for deleteMany (cleanup) — replaced by Warning/Sanction
-- Warning model merged into Sanction with type=WARN + points field added

-- Step 1: Migrate existing Warning data into Sanction
INSERT INTO "Sanction" ("userId", "guildId", "moderatorId", "type", "reason", "duration", "points", "active", "createdAt", "updatedAt")
SELECT 
  "userId", 
  "guildId", 
  COALESCE("moderatorId", 'system'),
  'WARN',
  COALESCE("reason", 'Migrated from Warning table'),
  NULL,
  "points",
  "active",
  "createdAt",
  "createdAt"
FROM "Warning"
ON CONFLICT DO NOTHING;

-- Step 2: Drop Warning table
DROP TABLE IF EXISTS "Warning";

-- Step 3: Drop WarningLog table
DROP TABLE IF EXISTS "WarningLog";

-- Step 4: Add points column to Sanction (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Sanction' AND column_name = 'points') THEN
    ALTER TABLE "Sanction" ADD COLUMN "points" INTEGER DEFAULT 1;
  END IF;
END $$;
