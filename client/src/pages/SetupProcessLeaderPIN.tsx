import { LegacyPasswordRouteRedirect } from "@/components/LegacyPasswordRouteRedirect";

/** @deprecated Use /setup-process-leader-password */
export default function SetupProcessLeaderPIN() {
  return <LegacyPasswordRouteRedirect targetPath="/setup-process-leader-password" />;
}
