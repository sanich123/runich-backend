CREATE TABLE "MediaCleanupJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "MediaCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaCleanupJob_status_createdAt_idx"
  ON "MediaCleanupJob"("status", "createdAt");
CREATE INDEX "MediaCleanupJob_user_id_createdAt_idx"
  ON "MediaCleanupJob"("user_id", "createdAt");
