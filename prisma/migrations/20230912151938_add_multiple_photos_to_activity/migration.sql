/*
  Warnings:

  - You are about to drop the column `photoUrl` on the `Activity` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "photoUrl",
ADD COLUMN     "photoUrls" TEXT[];
