-- Replace single user factory scope with a many-to-many input-permission scope.
CREATE TABLE IF NOT EXISTS "UserFactoryScope" (
  "userId" TEXT NOT NULL,
  "factoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFactoryScope_pkey" PRIMARY KEY ("userId", "factoryId")
);

INSERT INTO "UserFactoryScope" ("userId", "factoryId")
SELECT "id", "factoryId"
FROM "User"
WHERE "factoryId" IS NOT NULL
ON CONFLICT ("userId", "factoryId") DO NOTHING;

CREATE INDEX IF NOT EXISTS "UserFactoryScope_factoryId_idx" ON "UserFactoryScope"("factoryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserFactoryScope_userId_fkey'
  ) THEN
    ALTER TABLE "UserFactoryScope"
      ADD CONSTRAINT "UserFactoryScope_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserFactoryScope_factoryId_fkey'
  ) THEN
    ALTER TABLE "UserFactoryScope"
      ADD CONSTRAINT "UserFactoryScope_factoryId_fkey"
      FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_factoryId_fkey";
DROP INDEX IF EXISTS "User_factoryId_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "factoryId";
