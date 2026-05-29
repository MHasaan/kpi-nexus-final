import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ClaudeProvider,
  GeminiProvider,
  type IAiProvider,
  OpenAiProvider,
} from '@kpi-nexus/ai';
import { type AiProviderKey } from '@kpi-nexus/contracts';
import { Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import {
  type CryptoEnvelope,
  type MasterKey,
  decryptSecret,
  encryptSecret,
  loadMasterKey,
} from './byo-crypto.js';

/** Loose per-provider key-format guards (reject obvious paste errors early). */
const KEY_FORMAT: Partial<Record<AiProviderKey, RegExp>> = {
  CLAUDE: /^sk-ant-/,
  OPENAI: /^sk-/,
  GEMINI: /^AIza[0-9A-Za-z_-]{10,}$/,
};

const DISPLAY_NAME: Record<AiProviderKey, string> = {
  CLAUDE: 'Anthropic Claude',
  GEMINI: 'Google Gemini',
  OPENAI: 'OpenAI',
  OLLAMA: 'Ollama (local)',
};

export interface ByoStatus {
  key: AiProviderKey;
  displayName: string;
  configured: boolean;
}

/**
 * Bring-your-own-key management. Encrypts a tenant's provider API key with
 * AES-256-GCM (see byo-crypto) and stores the envelope in
 * AiProvider.encryptedCredentials. A live `ping()` validates the key on save
 * but a ping failure is non-fatal (the key is still stored). The registry reads
 * back decrypted keys via {@link getDecryptedKeyForOrg}.
 */
@Injectable()
export class ByoKeyService {
  private readonly logger = new Logger(ByoKeyService.name);
  private readonly master: MasterKey = loadMasterKey();

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ByoStatus[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.aiProvider.findMany({
      where: { organizationId: ctx.organizationId },
      select: { key: true, encryptedCredentials: true },
    });
    const configured = new Map(rows.map((r) => [r.key, r.encryptedCredentials != null]));
    return (['CLAUDE', 'GEMINI', 'OPENAI', 'OLLAMA'] as AiProviderKey[]).map((key) => ({
      key,
      displayName: DISPLAY_NAME[key],
      configured: configured.get(key) ?? false,
    }));
  }

  async setKey(key: AiProviderKey, apiKey: string): Promise<{ pingOk: boolean }> {
    if (key === 'OLLAMA') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Ollama is local and needs no API key' });
    }
    const format = KEY_FORMAT[key];
    if (format && !format.test(apiKey)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `That does not look like a ${DISPLAY_NAME[key]} key` });
    }

    const pingOk = await this.softPing(key, apiKey);
    const envelope = encryptSecret(apiKey, this.master);
    const ctx = RequestContextStore.require();
    await this.prisma.aiProvider.upsert({
      where: { organizationId_key: { organizationId: ctx.organizationId, key } },
      create: {
        organizationId: ctx.organizationId,
        key,
        displayName: DISPLAY_NAME[key],
        encryptedCredentials: envelope as unknown as object,
        supportedFeatures: [],
      },
      update: { encryptedCredentials: envelope as unknown as object, isEnabled: true },
    });
    return { pingOk };
  }

  async clearKey(key: AiProviderKey): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.prisma.aiProvider
      .update({
        where: { organizationId_key: { organizationId: ctx.organizationId, key } },
        // DbNull (not undefined) actually nulls the column — undefined is a no-op in Prisma.
        data: { encryptedCredentials: Prisma.DbNull },
      })
      .catch(() => undefined);
  }

  /** Decrypt the org's stored key for `key`, or null if none configured. */
  async getDecryptedKeyForOrg(organizationId: string, key: AiProviderKey): Promise<string | null> {
    const row = await this.prisma.aiProvider.findUnique({
      where: { organizationId_key: { organizationId, key } },
      select: { encryptedCredentials: true },
    });
    if (!row?.encryptedCredentials) return null;
    try {
      return decryptSecret(row.encryptedCredentials as unknown as CryptoEnvelope, this.master);
    } catch (err) {
      // Key-rotation or tamper: treat as unconfigured so we fall back to platform.
      this.logger.warn(`BYO decrypt failed for ${key} (org ${organizationId}): ${String(err)}`);
      return null;
    }
  }

  private buildProbe(key: AiProviderKey, apiKey: string): IAiProvider | null {
    switch (key) {
      case 'CLAUDE':
        return new ClaudeProvider({ apiKey });
      case 'OPENAI':
        return new OpenAiProvider({ apiKey });
      case 'GEMINI':
        return new GeminiProvider({ apiKeys: [apiKey] });
      default:
        return null;
    }
  }

  private async softPing(key: AiProviderKey, apiKey: string): Promise<boolean> {
    const probe = this.buildProbe(key, apiKey);
    if (!probe) return false;
    try {
      const res = await Promise.race([
        probe.ping(),
        new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: false }), 5000)),
      ]);
      return res.ok;
    } catch {
      return false;
    }
  }
}
