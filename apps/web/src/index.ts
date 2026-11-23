/**
 * @memoir/web
 * Privacy-first editorial web client.
 */

import { CRYPTO_ALGORITHM } from '@memoir/crypto';
import { MEMOIR_PROTOCOL_VERSION } from '@memoir/shared';

export function getClientConfig(): { appName: string; version: number; algorithm: string } {
  return {
    appName: 'Memoir',
    version: MEMOIR_PROTOCOL_VERSION,
    algorithm: CRYPTO_ALGORITHM,
  };
}
