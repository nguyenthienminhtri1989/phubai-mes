-- AlterTable: add excludeFromTotal flag to PowerMeter
-- Default false = all existing meters participate in totals as before.
ALTER TABLE "PowerMeter" ADD COLUMN "excludeFromTotal" BOOLEAN NOT NULL DEFAULT false;
