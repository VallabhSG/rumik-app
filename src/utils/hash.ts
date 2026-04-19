/**
 * DJB2 hash function — deterministic, fast, good distribution for bucketing.
 *
 * Used by:
 *   - OTA rollout: djb2(installId + releaseId) % 100
 *   - Remote config targeting: djb2(installId + entityKey) % 100
 *   - Config version fingerprint: djb2(serializedConfig)
 */
export function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}
