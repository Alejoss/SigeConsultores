import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { waitForNavigationMutations } from "@/components/ProcessQuickNavigation";
/** The application always has a QueryClient; isolated mocked components can omit the provider. */
export function useAnnualMutationWait(): () => Promise<boolean> {
  const client = useContext(QueryClientContext);
  return () => client ? waitForNavigationMutations(client) : Promise.resolve(true);
}
