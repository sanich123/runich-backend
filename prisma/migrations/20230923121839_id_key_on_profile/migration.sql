-- DropIndex
DROP INDEX "public"."Profile_id_key";

-- AlterTable
ALTER TABLE "public"."Profile" ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Profile_pkey" PRIMARY KEY ("id");
