-- AlterTable
ALTER TABLE "Activity"
ADD COLUMN "source" VARCHAR(32),
ADD COLUMN "sourceActivityId" VARCHAR(128);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_user_id_source_sourceActivityId_key"
ON "Activity"("user_id", "source", "sourceActivityId");
