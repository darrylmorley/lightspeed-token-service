-- CreateTable
CREATE TABLE "public"."lightspeed_tokens" (
    "id" SERIAL NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lightspeed_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lightspeed_tokens_expires_at_idx" ON "public"."lightspeed_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "lightspeed_tokens_access_token_idx" ON "public"."lightspeed_tokens"("access_token");

-- CreateIndex
CREATE INDEX "lightspeed_tokens_refresh_token_idx" ON "public"."lightspeed_tokens"("refresh_token");

-- CreateIndex
CREATE INDEX "lightspeed_tokens_updated_at_idx" ON "public"."lightspeed_tokens"("updated_at");
