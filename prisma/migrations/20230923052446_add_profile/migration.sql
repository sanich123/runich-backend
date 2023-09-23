-- DropIndex
DROP INDEX "public"."user_profiles_name_key";

-- AlterTable
ALTER TABLE "public"."user_profiles" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "birthday" TIMESTAMP(3),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "profilePhoto" TEXT,
ADD COLUMN     "sport" TEXT,
ADD COLUMN     "surname" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "weight" TEXT,
ALTER COLUMN "name" DROP NOT NULL;
