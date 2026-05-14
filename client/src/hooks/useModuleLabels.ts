import { useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Hook to get personalized module labels for a company
 * Returns labels object with customization data for each module
 */
export function useModuleLabels(companyId: number | null) {
  // Fetch module labels for the company
  // getLabels returns an object keyed by moduleName, not an array
  const { data: labelsObject = {}, isLoading } = trpc.moduleCustomization.getLabels.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId != null && companyId > 0 }
  );

  // Use the object directly (it's already keyed by moduleName)
  const labels = useMemo(() => {
    return labelsObject || {};
  }, [labelsObject]);

  const getLabel = useCallback(
    (moduleName: string, defaultValue: string) => {
      const row = labels[moduleName] as { customLabel?: string | null } | undefined;
      const v = row?.customLabel;
      if (typeof v === "string" && v.trim() !== "") {
        return v.trim();
      }
      return defaultValue;
    },
    [labels]
  );

  return {
    labels,
    isLoading,
    getLabel,
  };
}
