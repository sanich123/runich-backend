-- CreateTable
CREATE TABLE "public"."user_profiles" (
    "name" TEXT NOT NULL,
    "user_id" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_name_key" ON "public"."user_profiles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "public"."user_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "public"."user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
