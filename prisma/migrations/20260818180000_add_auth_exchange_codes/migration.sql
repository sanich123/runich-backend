CREATE TABLE "AuthExchange" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthExchange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthExchange_code_hash_key" ON "AuthExchange"("code_hash");
CREATE INDEX "AuthExchange_user_id_purpose_idx" ON "AuthExchange"("user_id", "purpose");
CREATE INDEX "AuthExchange_expires_at_idx" ON "AuthExchange"("expires_at");

ALTER TABLE "AuthExchange" ADD CONSTRAINT "AuthExchange_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
