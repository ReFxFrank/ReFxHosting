import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
} from './crypto.util';

/**
 * Injectable wrapper around crypto.util that binds the AES key from config so
 * callers never handle key material directly.
 */
@Injectable()
export class CryptoService {
  private readonly key: string;

  constructor(config: ConfigService) {
    this.key = config.get<string>('secretsEncKey')!;
  }

  encrypt(plaintext: string): string {
    return encryptSecret(plaintext, this.key);
  }

  decrypt(payload: string): string {
    return decryptSecret(payload, this.key);
  }

  hash(value: string): string {
    return sha256(value);
  }

  token(bytes = 32): string {
    return randomToken(bytes);
  }
}
