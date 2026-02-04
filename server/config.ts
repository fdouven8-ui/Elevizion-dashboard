/**
 * Central configuration validator for Elevizion Dashboard
 * Provides unified access to environment configuration and health status
 */

const LOG_PREFIX = "[Config]";

export interface ConfigHealth {
  nodeEnv: string;
  testMode: boolean;
  adsRequireContract: boolean;
  contractGatingBypassed: boolean;
  legacyUploadDisabled: boolean;
  tokenEncryptionKeyPresent: boolean;
  yodeckConfigured: boolean;
  moneybirdConfigured: boolean;
  objectStorageConfigured: boolean;
  warnings: string[];
  errors: string[];
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  testMode: boolean;
  adsRequireContract: boolean;
  contractGatingBypassed: boolean;
  legacyUploadDisabled: boolean;
  tokenEncryptionKeyPresent: boolean;
  tokenEncryptionKey: string | null;
  yodeckAuthToken: string | null;
  yodeckConfigured: boolean;
  moneybirdConfigured: boolean;
  objectStorageConfigured: boolean;
}

let _cachedConfig: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (_cachedConfig) return _cachedConfig;

  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const testModeRaw = (process.env.TEST_MODE || "false").toLowerCase();
  const testMode = testModeRaw === "true" || testModeRaw === "1";
  const adsRequireContractRaw = (process.env.ADS_REQUIRE_CONTRACT || "true").toLowerCase();
  const adsRequireContract = adsRequireContractRaw === "true";
  const legacyUploadDisabledRaw = (process.env.LEGACY_UPLOAD_DISABLED || "true").toLowerCase();
  const legacyUploadDisabled = legacyUploadDisabledRaw === "true";
  
  const tokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY || null;
  const tokenEncryptionKeyPresent = !!(tokenEncryptionKey && tokenEncryptionKey.length >= 32);
  
  const yodeckAuthToken = process.env.YODECK_AUTH_TOKEN?.trim() || null;
  const yodeckConfigured = !!(yodeckAuthToken && yodeckAuthToken.length > 10);
  
  const moneybirdConfigured = !!(
    process.env.MONEYBIRD_API_TOKEN && 
    process.env.MONEYBIRD_ADMINISTRATION_ID
  );
  
  const objectStorageConfigured = !!(
    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ||
    process.env.PUBLIC_OBJECT_SEARCH_PATHS
  );

  const contractGatingBypassed = testMode || !adsRequireContract;

  _cachedConfig = {
    nodeEnv,
    isProduction,
    testMode,
    adsRequireContract,
    contractGatingBypassed,
    legacyUploadDisabled,
    tokenEncryptionKeyPresent,
    tokenEncryptionKey: tokenEncryptionKeyPresent ? tokenEncryptionKey : null,
    yodeckAuthToken,
    yodeckConfigured,
    moneybirdConfigured,
    objectStorageConfigured,
  };

  return _cachedConfig;
}

export function getConfigHealth(): ConfigHealth {
  const config = getAppConfig();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (config.isProduction && config.testMode) {
    warnings.push("PROD_WITH_TEST_MODE: NODE_ENV=production but TEST_MODE=true - contracts and placements bypassed!");
  }

  if (!config.tokenEncryptionKeyPresent) {
    warnings.push("TOKEN_ENCRYPTION_KEY_MISSING: Token reuse for upload portals is disabled");
  }

  if (config.contractGatingBypassed) {
    warnings.push(`CONTRACT_GATING_BYPASSED: Ads can be included without contracts (testMode=${config.testMode}, adsRequireContract=${config.adsRequireContract})`);
  }

  if (!config.yodeckConfigured) {
    errors.push("YODECK_NOT_CONFIGURED: YODECK_AUTH_TOKEN missing or invalid");
  }

  if (!config.moneybirdConfigured) {
    warnings.push("MONEYBIRD_NOT_CONFIGURED: Invoicing integration unavailable");
  }

  if (!config.objectStorageConfigured) {
    warnings.push("OBJECT_STORAGE_NOT_CONFIGURED: File uploads may not work");
  }

  return {
    nodeEnv: config.nodeEnv,
    testMode: config.testMode,
    adsRequireContract: config.adsRequireContract,
    contractGatingBypassed: config.contractGatingBypassed,
    legacyUploadDisabled: config.legacyUploadDisabled,
    tokenEncryptionKeyPresent: config.tokenEncryptionKeyPresent,
    yodeckConfigured: config.yodeckConfigured,
    moneybirdConfigured: config.moneybirdConfigured,
    objectStorageConfigured: config.objectStorageConfigured,
    warnings,
    errors,
  };
}

export function logStartupConfig(): void {
  const config = getAppConfig();
  const health = getConfigHealth();

  console.log(`${LOG_PREFIX} ========================================`);
  console.log(`${LOG_PREFIX} NODE_ENV=${config.nodeEnv}`);
  console.log(`${LOG_PREFIX} TEST_MODE=${config.testMode}`);
  console.log(`${LOG_PREFIX} ADS_REQUIRE_CONTRACT=${config.adsRequireContract}`);
  console.log(`${LOG_PREFIX} CONTRACT_GATING_BYPASSED=${config.contractGatingBypassed}`);
  console.log(`${LOG_PREFIX} LEGACY_UPLOAD_DISABLED=${config.legacyUploadDisabled}`);
  console.log(`${LOG_PREFIX} TOKEN_ENCRYPTION_KEY_PRESENT=${config.tokenEncryptionKeyPresent}`);
  console.log(`${LOG_PREFIX} YODECK_CONFIGURED=${config.yodeckConfigured}`);
  console.log(`${LOG_PREFIX} MONEYBIRD_CONFIGURED=${config.moneybirdConfigured}`);
  console.log(`${LOG_PREFIX} OBJECT_STORAGE_CONFIGURED=${config.objectStorageConfigured}`);

  for (const warning of health.warnings) {
    console.warn(`${LOG_PREFIX} WARNING: ${warning}`);
  }

  for (const error of health.errors) {
    console.error(`${LOG_PREFIX} ERROR: ${error}`);
  }

  console.log(`${LOG_PREFIX} ========================================`);
}

export function clearConfigCache(): void {
  _cachedConfig = null;
}
