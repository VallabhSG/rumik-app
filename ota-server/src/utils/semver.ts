/**
 * Minimal semver comparison — handles X.Y.Z and X.Y formats.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function parse(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareSemver(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

/** Returns true when version satisfies [min, max] (both bounds optional, inclusive). */
export function isVersionInRange(
  version: string,
  min: string | null,
  max: string | null,
): boolean {
  if (min && compareSemver(version, min) < 0) return false;
  if (max && compareSemver(version, max) > 0) return false;
  return true;
}
