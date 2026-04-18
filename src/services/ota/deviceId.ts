import { storage } from "./storage";

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomId(length = 32): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}

let cached: string | null = null;

/**
 * Returns a stable install-scoped ID. Generated once on first launch and
 * persisted in AsyncStorage. Used to deterministically assign devices to
 * rollout buckets — same device always lands in the same bucket for the
 * same release.
 */
export async function getInstallId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await storage.getInstallId();
    if (stored) {
      cached = stored;
      return stored;
    }
    const id = randomId();
    await storage.setInstallId(id);
    cached = id;
    return id;
  } catch {
    // AsyncStorage unavailable — generate a session-scoped ID (not persisted)
    const id = randomId();
    cached = id;
    return id;
  }
}
