-- Store optional pedometer data for tracked activities.
ALTER TABLE "Activity"
ADD COLUMN "steps" INTEGER;
