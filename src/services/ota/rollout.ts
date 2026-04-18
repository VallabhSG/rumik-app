/**
 * Deterministic rollout bucketing.
 *
 * Uses DJB2 hash of (installId + releaseId) to assign each device a 0–99
 * bucket. The device is in the rollout when its bucket < rolloutPercentage.
 *
 * Properties:
 *   - Same device always gets the same bucket for the same release
 *   - Widening rollout_percentage from 5→25 includes the original 5% cohort
 *     plus a new 20% slice — no churn in already-updated devices
 *   - Two different releases hash independently, so a device can be in the
 *     rollout for one release and not another
 */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // (hash * 33) XOR char — keep as unsigned 32-bit
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function isInRollout(
  installId: string,
  releaseId: string,
  rolloutPercentage: number,
): boolean {
  if (rolloutPercentage >= 100) return true;
  if (rolloutPercentage <= 0) return false;
  const bucket = djb2(installId + releaseId) % 100;
  return bucket < rolloutPercentage;
}
