/**
 * DJB2 hash function — deterministic, fast, good distribution for bucketing.
 *
 * Used by:
 *   - Rollout scheduler bucketing
 *   - Remote config targeting percentage
 *   - Config version fingerprint
 */
export function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}
