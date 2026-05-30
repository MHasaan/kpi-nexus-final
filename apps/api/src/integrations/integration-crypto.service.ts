import { Injectable, Optional } from '@nestjs/common';

import { decryptTokens, encryptTokens, loadMasterKey } from './integration-crypto.js';

/**
 * Nest-injectable wrapper around the pure integration crypto. Loads the master
 * key once at construction; provider modules inject this to seal/open tokens.
 * The `env` param is @Optional so Nest injects nothing and we fall back to
 * process.env; tests pass an explicit env.
 */
@Injectable()
export class IntegrationCryptoService {
  private readonly key: Buffer;

  constructor(@Optional() env?: Record<string, string | undefined>) {
    this.key = loadMasterKey(env ?? process.env);
  }

  encrypt(tokens: unknown): string {
    return encryptTokens(tokens, this.key);
  }

  decrypt<T = Record<string, unknown>>(blob: string): T {
    return decryptTokens<T>(blob, this.key);
  }
}
