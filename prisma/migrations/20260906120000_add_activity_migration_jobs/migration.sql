CREATE TABLE "ActivityMigrationJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "archivePath" VARCHAR(2048) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "totalActivities" INTEGER NOT NULL DEFAULT 0,
    "processedActivities" INTEGER NOT NULL DEFAULT 0,
    "importedActivities" INTEGER NOT NULL DEFAULT 0,
    "skippedActivities" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ActivityMigrationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityMigrationJob_user_id_createdAt_idx"
  ON "ActivityMigrationJob"("user_id", "createdAt");
CREATE INDEX "ActivityMigrationJob_status_createdAt_idx"
  ON "ActivityMigrationJob"("status", "createdAt");

ALTER TABLE "ActivityMigrationJob" ADD CONSTRAINT "ActivityMigrationJob_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "ActivityMigrationJob" ADD CONSTRAINT "ActivityMigrationJob_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
