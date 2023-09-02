/*
  Warnings:

  - You are about to drop the column `likes` on the `Activity` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "likes";

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Like_activityId_key" ON "Like"("activityId");

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
