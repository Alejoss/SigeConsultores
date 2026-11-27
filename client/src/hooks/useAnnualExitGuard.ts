import { useEffect, useRef } from "react";
import { registerAnnualExitGuard, type AnnualExitGuard } from "@/lib/annualNavigation";
/** Register the same flush used by published quick navigation, without changing debounce cadence. */
export function useAnnualExitGuard(guard: AnnualExitGuard): void {
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => registerAnnualExitGuard(() => latest.current()), []);
}
