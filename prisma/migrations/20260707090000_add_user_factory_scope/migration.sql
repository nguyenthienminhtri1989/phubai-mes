-- Add optional factory scope for user daily-input permissions.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "factoryId" TEXT;

CREATE INDEX IF NOT EXISTS "User_factoryId_idx" ON "User"("factoryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_factoryId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_factoryId_fkey"
      FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;