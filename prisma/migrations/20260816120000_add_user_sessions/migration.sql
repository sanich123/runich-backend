CREATE TABLE "UserSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_hash" VARCHAR(128) NOT NULL,
    "device_id" VARCHAR(128) NOT NULL,
    "device_name" VARCHAR(255),
    "platform" VARCHAR(64),
    "device_model" VARCHAR(128),
    "manufacturer" VARCHAR(128),
    "os_name" VARCHAR(64),
    "os_version" VARCHAR(64),
    "device_type" VARCHAR(64),
    "app_version" VARCHAR(32),
    "app_build" VARCHAR(32),
    "user_agent" VARCHAR(512),
    "ip_address" VARCHAR(128),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_latitude" DOUBLE PRECISION,
    "last_longitude" DOUBLE PRECISION,
    "last_location_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSession_refresh_hash_key" ON "UserSession"("refresh_hash");
CREATE INDEX "UserSession_user_id_idx" ON "UserSession"("user_id");
CREATE INDEX "UserSession_user_id_device_id_idx" ON "UserSession"("user_id", "device_id");

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
