-- Add nullable factory link directly on PowerMeter for medium-voltage meters and fast factory filtering.
ALTER TABLE "PowerMeter" ADD COLUMN IF NOT EXISTS "factoryId" TEXT;

-- Preserve compatibility for existing low-voltage meters by deriving factory from their substation.
UPDATE "PowerMeter" AS meter
SET "factoryId" = transformer."factoryId"
FROM "PowerTransformer" AS transformer
WHERE meter."transformerId" = transformer."id"
  AND meter."factoryId" IS NULL
  AND transformer."factoryId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "PowerMeter_factoryId_idx" ON "PowerMeter"("factoryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PowerMeter_factoryId_fkey'
  ) THEN
    ALTER TABLE "PowerMeter"
      ADD CONSTRAINT "PowerMeter_factoryId_fkey"
      FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
