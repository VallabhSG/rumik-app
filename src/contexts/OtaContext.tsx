import React, { createContext, useContext } from "react";
import { useOtaUpdate } from "../hooks/useOtaUpdate";
import type { UpdateStatus } from "../services/ota/types";

interface OtaContextValue {
  status: UpdateStatus;
  error: string | null;
  download: () => Promise<void>;
  applyNow: () => Promise<void>;
}

const OtaContext = createContext<OtaContextValue | null>(null);

export function OtaProvider({ children }: { children: React.ReactNode }) {
  const ota = useOtaUpdate();
  return <OtaContext.Provider value={ota}>{children}</OtaContext.Provider>;
}

export function useOta(): OtaContextValue {
  const ctx = useContext(OtaContext);
  if (!ctx) throw new Error("useOta must be used inside OtaProvider");
  return ctx;
}
