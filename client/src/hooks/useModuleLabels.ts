import { useMemo } from "react";
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
    { enabled: companyId !== null }
  );

  // Use the object directly (it's already keyed by moduleName)
  const labels = useMemo(() => {
    return labelsObject || {};
  }, [labelsObject]);

  // Helper function to get label for a specific module
  const getLabel = (moduleName: string, labelKey: string, defaultValue: string) => {
    const moduleCustomization = labels[moduleName];
    if (moduleCustomization && moduleCustomization[labelKey]) {
      return moduleCustomization[labelKey];
    }
    return defaultValue;
  };

  return {
    labels,
    isLoading,
    getLabel,
  };
}
