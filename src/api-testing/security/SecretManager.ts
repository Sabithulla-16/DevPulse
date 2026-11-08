import { randomUUID } from 'node:crypto';

export interface SecretStorageInterface {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): Thenable<void> | Promise<void>;
  delete(key: string): Thenable<void> | Promise<void>;
}

export class SecretManager {
  constructor(private readonly secrets: SecretStorageInterface) {}

  generateSecretRef(): string {
    return `devpulse.api_testing.secret.${randomUUID()}`;
  }

  async storeSecret(value: string, existingRef?: string): Promise<string> {
    const ref = existingRef || this.generateSecretRef();
    await Promise.resolve(this.secrets.store(ref, value));
    return ref;
  }

  async getSecret(ref: string): Promise<string | undefined> {
    return Promise.resolve(this.secrets.get(ref));
  }

  async deleteSecret(ref: string): Promise<void> {
    await Promise.resolve(this.secrets.delete(ref));
  }

  async deleteSecrets(refs: string[]): Promise<void> {
    for (const ref of refs) {
      if (ref && ref.startsWith('devpulse.api_testing.secret.')) {
        await Promise.resolve(this.secrets.delete(ref)).catch(() => {});
      }
    }
  }
}
