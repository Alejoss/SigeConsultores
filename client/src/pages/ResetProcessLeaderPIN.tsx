import { LegacyPasswordRouteRedirect } from "@/components/LegacyPasswordRouteRedirect";

/** @deprecated Use /forgot-password-manager */
export default function ResetProcessLeaderPIN() {
  return <LegacyPasswordRouteRedirect targetPath="/forgot-password-manager" />;
}
