import { describe, expect, it } from 'vitest';
import { AppConfigService } from '../config/config.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns health check status with protocol version', async () => {
    const config = new AppConfigService();
    const controller = new HealthController(config);

    const result = await controller.check();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('protocolVersion', 1);
    expect(result).toHaveProperty('services');
    expect(result.services).toHaveProperty('postgres');
    expect(result.services).toHaveProperty('redis');
    expect(result.services.postgres).toBe('connected');
    expect(result.services.redis).toBe('connected');
    expect(result.status).toBe('ok');
  });
});
