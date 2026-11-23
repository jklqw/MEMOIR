/**
 * @memoir/api
 * NestJS Modular Monolith API foundation.
 */

import { MEMOIR_PROTOCOL_VERSION } from '@memoir/shared';

export function getApiStatus(): { status: string; protocolVersion: number } {
  return {
    status: 'ok',
    protocolVersion: MEMOIR_PROTOCOL_VERSION,
  };
}
