/*
  Warnings:

  - You are about to drop the `user_profiles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."user_profiles" DROP CONSTRAINT "user_profiles_user_id_fkey";

-- DropTable
DROP TABLE "public"."user_profiles";

-- CreateTable
CREATE TABLE "public"."Profile" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "user_id" UUID NOT NULL,
    "bio" TEXT,
    "birthday" TIMESTAMP(3),
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gender" TEXT,
    "profilePhoto" TEXT,
    "sport" TEXT,
    "surname" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_id_key" ON "public"."Profile"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_user_id_key" ON "public"."Profile"("user_id");

-- AddForeignKey
ALTER TABLE "public"."Profile" ADD CONSTRAINT "Profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
