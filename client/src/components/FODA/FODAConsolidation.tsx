import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";

interface FODAConsolidationProps {
  companyId: number;
  enterpriseVersions: Map<string, string>;
  setEnterpriseVersions: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  onElementSelected?: () => void;
}

interface FODAElement {
  statement: string;
  description: string;
  subprocess: string;
  policyObjective: string;
  selectedObjectiveContent: string;
}

interface ProcessFODA {
  processId: number;
  processName: string;
  strengths: FODAElement[];
  opportunities: FODAElement[];
  weaknesses: FODAElement[];
  threats: FODAElement[];
}

interface FODARow {
  processId: number;
  processName: string;
  type: "Fortaleza" | "Oportunidad" | "Debilidad" | "Amenaza";
  element: FODAElement;
}

export default function FODAConsolidation({ companyId, enterpriseVersions, setEnterpriseVersions, onElementSelected }: FODAConsolidationProps) {

  // Fetch process FODAs
  const { data: processFODAs = [], isLoading } = trpc.fodasRouter.listProcessFODAs.useQuery({
    companyId,
  });

  // Mutations
  const toggleSelectionMutation = trpc.fodasRouter.toggleSelection.useMutation({
    onSuccess: () => {
      toast.success("Elemento subido a FODA de Empresa");
      onElementSelected?.();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const getElementKey = (processId: number, type: string, statement: string) => {
    return `${processId}-${type}-${statement}`;
  };

  const handleEnterpriseVersionChange = (key: string, value: string) => {
    setEnterpriseVersions((prev) => {
      const newMap = new Map(prev);
      newMap.set(key, value);
      return newMap;
    });
  };

  const handleUploadToCompanyFODA = (
    processId: number,
    processName: string,
    type: "Fortaleza" | "Oportunidad" | "Debilidad" | "Amenaza",
    element: FODAElement
  ) => {
    const key = getElementKey(processId, type, element.statement);
    const enterpriseVersion = enterpriseVersions.get(key)?.trim();

    if (!enterpriseVersion) {
      toast.error("Por favor completa el campo de versión para empresa");
      return;
    }

    toggleSelectionMutation.mutate({
      companyId,
      processId,
      type,
      originalText: element.statement,
      enterpriseVersion: enterpriseVersion,
      isSelected: true,
    });

    // Don't clear the field - let the user see what they wrote
    // Field will persist until they manually clear it or navigate away
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Cargando FODAs de procesos...</p>
        </CardContent>
      </Card>
    );
  }

  // Collect all FODA rows in order: Fortalezas → Oportunidades → Debilidades → Amenazas
  const allRows: FODARow[] = [];

  processFODAs.forEach((processFODA: ProcessFODA) => {
    // Add strengths
    processFODA.strengths.forEach((element) => {
      allRows.push({
        processId: processFODA.processId,
        processName: processFODA.processName,
        type: "Fortaleza",
        element,
      });
    });
  });

  processFODAs.forEach((processFODA: ProcessFODA) => {
    // Add opportunities
    processFODA.opportunities.forEach((element) => {
      allRows.push({
        processId: processFODA.processId,
        processName: processFODA.processName,
        type: "Oportunidad",
        element,
      });
    });
  });

  processFODAs.forEach((processFODA: ProcessFODA) => {
    // Add weaknesses
    processFODA.weaknesses.forEach((element) => {
      allRows.push({
        processId: processFODA.processId,
        processName: processFODA.processName,
        type: "Debilidad",
        element,
      });
    });
  });

  processFODAs.forEach((processFODA: ProcessFODA) => {
    // Add threats
    processFODA.threats.forEach((element) => {
      allRows.push({
        processId: processFODA.processId,
        processName: processFODA.processName,
        type: "Amenaza",
        element,
      });
    });
  });

  // Get color scheme for each type
  const getTypeColors = (type: string) => {
    switch (type) {
      case "Fortaleza":
        return { bg: "bg-green-50 dark:bg-green-950", border: "border-l-green-500", text: "text-green-700 dark:text-green-300" };
      case "Oportunidad":
        return { bg: "bg-blue-50 dark:bg-blue-950", border: "border-l-blue-500", text: "text-blue-700 dark:text-blue-300" };
      case "Debilidad":
        return { bg: "bg-yellow-50 dark:bg-yellow-950", border: "border-l-yellow-500", text: "text-yellow-700 dark:text-yellow-300" };
      case "Amenaza":
        return { bg: "bg-red-50 dark:bg-red-950", border: "border-l-red-500", text: "text-red-700 dark:text-red-300" };
      default:
        return { bg: "bg-gray-50 dark:bg-gray-950", border: "border-l-gray-500", text: "text-gray-700 dark:text-gray-300" };
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Consolidación de FODAs de Procesos</CardTitle>
          <CardDescription>
            Para cada elemento, redacta la versión generalizada que será parte del FODA de la empresa y haz click en "Subir a FODA".
            Se muestran todos los elementos en orden: Fortalezas → Oportunidades → Debilidades → Amenazas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay procesos con FODA definido</p>
          ) : (
            <div className="space-y-4">
              {allRows.map((row, idx) => {
                const key = getElementKey(row.processId, row.type, row.element.statement);
                const enterpriseVersion = enterpriseVersions.get(key) || "";
                const colors = getTypeColors(row.type);

                return (
                  <div key={`${key}-${idx}`} className={`${colors.bg} rounded-lg p-4 border-l-4 ${colors.border}`}>
                    {/* Row header with type and process */}
                    <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${colors.text}`}>{row.type}</span>
                          <span className="text-xs text-muted-foreground">|</span>
                          <span className="text-xs text-muted-foreground">{row.processName}</span>
                        </div>
                        <span className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded">Fila {idx + 1}</span>
                      </div>
                    </div>

                    {/* Three columns: Enunciado | Descripción | Versión Empresa */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Column 1: Enunciado */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                          Enunciado
                        </label>
                        <div className="bg-white dark:bg-gray-900 rounded p-3 min-h-24 border border-gray-200 dark:border-gray-700">
                          <p className="text-sm text-foreground leading-relaxed">{row.element.statement}</p>
                        </div>
                      </div>

                      {/* Column 2: Descripción (Justificación) */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                          Descripción (Justificación)
                        </label>
                        <div className="bg-white dark:bg-gray-900 rounded p-3 min-h-24 border border-gray-200 dark:border-gray-700">
                          <p className="text-sm text-foreground leading-relaxed">{row.element.description}</p>
                        </div>
                      </div>

                      {/* Column 3: Versión para Empresa + Botón */}
                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                          Versión para Empresa
                        </label>
                        <Textarea
                          value={enterpriseVersion}
                          onChange={(e) => handleEnterpriseVersionChange(key, e.target.value)}
                          placeholder="Redacta aquí la versión generalizada para la empresa..."
                          className="flex-1 resize-none text-sm mb-2"
                        />
                        <Button
                          onClick={() =>
                            handleUploadToCompanyFODA(row.processId, row.processName, row.type, row.element)
                          }
                          disabled={toggleSelectionMutation.isPending || !enterpriseVersion.trim()}
                          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          <Upload className="w-4 h-4" />
                          Subir a FODA
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
        <p>
          Total de elementos: <strong>{allRows.length}</strong>
        </p>
      </div>
    </div>
  );
}
