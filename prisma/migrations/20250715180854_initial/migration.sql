-- CreateTable
CREATE TABLE "Users" (
    "instance_id" UUID,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aud" VARCHAR(255),
    "role" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "encrypted_password" VARCHAR(255),
    "email_confirmed_at" TIMESTAMPTZ(6),
    "invited_at" TIMESTAMPTZ(6),
    "confirmation_token" VARCHAR(255),
    "confirmation_sent_at" TIMESTAMPTZ(6),
    "recovery_token" VARCHAR(255),
    "recovery_sent_at" TIMESTAMPTZ(6),
    "email_change_token_new" VARCHAR(255),
    "email_change" VARCHAR(255),
    "email_change_sent_at" TIMESTAMPTZ(6),
    "last_sign_in_at" TIMESTAMPTZ(6),
    "raw_app_meta_data" JSONB,
    "raw_user_meta_data" JSONB,
    "is_super_admin" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "phone" TEXT,
    "phone_confirmed_at" TIMESTAMPTZ(6),
    "phone_change" TEXT DEFAULT '',
    "phone_change_token" VARCHAR(255) DEFAULT '',
    "phone_change_sent_at" TIMESTAMPTZ(6),
    "email_change_token_current" VARCHAR(255) DEFAULT '',
    "email_change_confirm_status" SMALLINT DEFAULT 0,
    "banned_until" TIMESTAMPTZ(6),
    "reauthentication_token" VARCHAR(255) DEFAULT '',
    "reauthentication_sent_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "user_id" UUID NOT NULL,
    "bio" TEXT,
    "birthday" DATE,
    "city" TEXT,
    "gender" TEXT,
    "profilePhoto" TEXT,
    "sport" TEXT,
    "surname" TEXT,
    "updatedAt" TIMESTAMPTZ(6),
    "weight" TEXT,
    "email" TEXT,
    "language" TEXT,
    "emailNotifications" BOOLEAN DEFAULT false,
    "profilePhotoBlurhash" TEXT,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "distance" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "emotion" TEXT,
    "locations" JSONB,
    "user_id" UUID NOT NULL,
    "speed" INTEGER NOT NULL,
    "sport" TEXT NOT NULL,
    "title" TEXT,
    "kilometresSplit" JSONB,
    "mapPhotoUrl" TEXT,
    "photoVideoUrls" JSONB,
    "isPublic" BOOLEAN DEFAULT true,
    "mapPhotoUrlBlurhash" TEXT,
    "profileId" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friend" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "friendId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "activityId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentLike" (
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "commentId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activityId" UUID NOT NULL,
    "profileId" UUID NOT NULL,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_phone_key" ON "Users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_user_id_key" ON "Profile"("user_id");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
