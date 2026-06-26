-- AlterTable
-- Cot timestamp truoc day la "timestamp without time zone", duoc cron ghi bang now()
-- duoi session Postgres TimeZone=Asia/Ho_Chi_Minh, nen gia tri da luu la GIO THUC TE VN.
-- Phai chi dinh ro AT TIME ZONE 'Asia/Ho_Chi_Minh' khi convert sang timestamptz de khong
-- phu thuoc vao TimeZone GUC cua session dang chay migration nay (co the khac mac dinh).
ALTER TABLE "PowerTelemetry"
  ALTER COLUMN "timestamp" TYPE TIMESTAMPTZ
  USING "timestamp" AT TIME ZONE 'Asia/Ho_Chi_Minh';
