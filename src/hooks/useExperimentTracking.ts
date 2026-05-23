import { useCallback } from "react";
import { useRemoteConfigClient } from "./useRemoteConfig";

export function useExperimentTracking(experimentKey: string, variantId: string | null) {
  const client = useRemoteConfigClient();

  const trackExposure = useCallback(
    async (installId: string, userId?: string) => {
      if (!variantId) return;
      try {
        await client.trackExposure(experimentKey, {
          install_id: installId,
          variant_id: variantId,
          user_id: userId,
        });
      } catch {
        // fire-and-forget
      }
    },
    [client, experimentKey, variantId],
  );

  const trackConversion = useCallback(
    async (installId: string, eventName: string, value = 1, userId?: string) => {
      if (!variantId) return;
      try {
        await client.trackConversion(experimentKey, {
          install_id: installId,
          variant_id: variantId,
          event_name: eventName,
          value,
          user_id: userId,
        });
      } catch {
        // fire-and-forget
      }
    },
    [client, experimentKey, variantId],
  );

  return { trackExposure, trackConversion };
}
