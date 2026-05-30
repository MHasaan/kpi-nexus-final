-- Manual migration: P9 Polish — SSO config + SCIM provisioning tokens.
-- Hand-written (P5+ convention). Does not touch the KPIDataPoint hypertable.

-- Enums -----------------------------------------------------------------------

CREATE TYPE "SsoProtocol" AS ENUM ('SAML', 'OIDC');

-- SsoConfig -------------------------------------------------------------------

CREATE TABLE "SsoConfig" (
  "id"                   TEXT          NOT NULL,
  "organizationId"       TEXT          NOT NULL,
  "protocol"             "SsoProtocol" NOT NULL,
  "idpEntityId"          TEXT,
  "idpSsoUrl"            TEXT,
  "idpMetadataUrl"       TEXT,
  "encryptedCertificate" TEXT,
  "allowJitProvisioning" BOOLEAN       NOT NULL DEFAULT true,
  "defaultRoleId"        TEXT,
  "isActive"             BOOLEAN       NOT NULL DEFAULT false,
  "createdAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "SsoConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SsoConfig_organizationId_key" ON "SsoConfig"("organizationId");

ALTER TABLE "SsoConfig"
  ADD CONSTRAINT "SsoConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ScimToken -------------------------------------------------------------------

CREATE TABLE "ScimToken" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "label"          TEXT         NOT NULL,
  "hashedToken"    TEXT         NOT NULL,
  "expiresAt"      TIMESTAMP(3),
  "lastUsedAt"     TIMESTAMP(3),
  "revokedAt"      TIMESTAMP(3),
  "createdById"    TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScimToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScimToken_hashedToken_key"            ON "ScimToken"("hashedToken");
CREATE INDEX "ScimToken_organizationId_revokedAt_idx"    ON "ScimToken"("organizationId", "revokedAt");

ALTER TABLE "ScimToken"
  ADD CONSTRAINT "ScimToken_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
