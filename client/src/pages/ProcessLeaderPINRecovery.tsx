import { LegacyPasswordRouteRedirect } from "@/components/LegacyPasswordRouteRedirect";

/** @deprecated Use /forgot-password-manager */
export default function ProcessLeaderPINRecovery() {
  return <LegacyPasswordRouteRedirect targetPath="/forgot-password-manager" />;
}
