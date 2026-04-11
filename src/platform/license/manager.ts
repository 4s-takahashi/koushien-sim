import type { LicenseManager, LicenseStatus } from './types';

export function createDevLicenseManager(): LicenseManager {
  const status: LicenseStatus = {
    valid: true,
    reason: 'dev_mode',
    expiresAt: null,
    plan: 'dev',
  };

  return {
    getStatus: async () => status,
    authenticate: async () => status,
    canPlay: async () => true,
  };
}
