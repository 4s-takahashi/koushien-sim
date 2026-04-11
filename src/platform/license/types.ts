export interface LicenseStatus {
  valid: boolean;
  reason: LicenseReason;
  expiresAt: number | null;
  plan: LicensePlan;
}

export type LicenseReason =
  | 'active'
  | 'offline_grace'
  | 'expired'
  | 'subscription_lapsed'
  | 'not_authenticated'
  | 'dev_mode';

export type LicensePlan =
  | 'dev'
  | 'free_trial'
  | 'monthly'
  | 'annual'
  | 'lifetime';

export interface LicenseManager {
  getStatus(): Promise<LicenseStatus>;
  authenticate(): Promise<LicenseStatus>;
  canPlay(): Promise<boolean>;
}
