import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CustomizeModulesPanelProps {
  allCompanies: any[];
  isLoadingCompanies: boolean;
}

// Define available modules
const MODULES = [
  {
    id: "sige_modules",
    name: "Módulos de SIGE",
    description: "Personaliza los nombres de los módulos principales del sistema",
    fields: [
      { key: "label1", default: "Propósito, Misión, Visión", placeholder: "Propósito, Misión, Visión" },
      { key: "label2", default: "Valores Empresariales", placeholder: "Valores Empresariales" },
      { key: "label3", default: "Política", placeholder: "Política" },
      { key: "label4", default: "Objetivos Estratégicos", placeholder: "Objetivos Estratégicos" },
      { key: "label5", default: "Mapa de Procesos", placeholder: "Mapa de Procesos" },
    ],
  },
  {
    id: "purpose_mission_vision",
    name: "Propósito, Misión, Visión",
    description: "Define los fundamentos estratégicos de tu empresa",
    fields: [
      { key: "label1", default: "Propósito", placeholder: "Propósito" },
      { key: "label2", default: "Misión", placeholder: "Misión" },
      { key: "label3", default: "Visión", placeholder: "Visión" },
    ],
  },
  {
    id: "corporate_values",
    name: "Valores Empresariales",
    description: "Establece los valores que guían tu organización",
    fields: [
      { key: "label1", default: "Valor 1", placeholder: "Valor 1" },
      { key: "label2", default: "Valor 2", placeholder: "Valor 2" },
      { key: "label3", default: "Valor 3", placeholder: "Valor 3" },
      { key: "label4", default: "Valor 4", placeholder: "Valor 4 (opcional)" },
      { key: "label5", default: "Valor 5", placeholder: "Valor 5 (opcional)" },
    ],
  },
  {
    id: "strategic_objectives",
    name: "Objetivos Estratégicos",
    description: "Define los objetivos a largo plazo de tu empresa",
    fields: [
      { key: "label1", default: "Objetivo 1", placeholder: "Objetivo 1" },
      { key: "label2", default: "Objetivo 2", placeholder: "Objetivo 2" },
      { key: "label3", default: "Objetivo 3", placeholder: "Objetivo 3" },
      { key: "label4", default: "Objetivo 4", placeholder: "Objetivo 4 (opcional)" },
      { key: "label5", default: "Objetivo 5", placeholder: "Objetivo 5 (opcional)" },
    ],
  },
  {
    id: "policy",
    name: "Política",
    description: "Documenta la política del Sistema Integrado de Gestión",
    fields: [
      { key: "label1", default: "Política Principal", placeholder: "Política Principal" },
      { key: "label2", default: "Política 2", placeholder: "Política 2 (opcional)" },
      { key: "label3", default: "Política 3", placeholder: "Política 3 (opcional)" },
    ],
  },
  {
    id: "process_map",
    name: "Mapa de Procesos",
    description: "Visualiza y gestiona los procesos de tu organización",
    fields: [
      { key: "label1", default: "Procesos Estratégicos", placeholder: "Procesos Estratégicos" },
      { key: "label2", default: "Procesos Operativos", placeholder: "Procesos Operativos" },
      { key: "label3", default: "Procesos de Apoyo", placeholder: "Procesos de Apoyo" },
    ],
  },
  {
    id: "indicators",
    name: "Indicadores",
    description: "Monitorea el desempeño de tu Sistema Integrado de Gestión",
    fields: [
      { key: "label1", default: "Indicador 1", placeholder: "Indicador 1" },
      { key: "label2", default: "Indicador 2", placeholder: "Indicador 2" },
      { key: "label3", default: "Indicador 3", placeholder: "Indicador 3" },
      { key: "label4", default: "Indicador 4", placeholder: "Indicador 4 (opcional)" },
      { key: "label5", default: "Indicador 5", placeholder: "Indicador 5 (opcional)" },
    ],
  },
];

export default function CustomizeModulesPanel({
  allCompanies,
  isLoadingCompanies,
}: CustomizeModulesPanelProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string>("sige_modules");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentModule = MODULES.find((m) => m.id === selectedModuleId);

  // Fetch current customization when company or module is selected
  const customizationQuery = trpc.moduleCustomization.get.useQuery(
    { companyId: selectedCompanyId || 0, moduleName: selectedModuleId },
    { enabled: selectedCompanyId !== null }
  );

  // Upsert mutation with autosave
  const upsertMutation = trpc.moduleCustomization.upsert.useMutation({
    onSuccess: () => {
      setSaveStatus("saved");
      // Keep "saved" status for 2 seconds, then return to idle
      const timer = setTimeout(() => setSaveStatus("idle"), 2000);
      return () => clearTimeout(timer);
    },
    onError: (error: any) => {
      setSaveStatus("error");
      toast.error(error.message || "Error al guardar la personalización");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  // Initialize labels with defaults for the current module
  useEffect(() => {
    if (!currentModule) return;

    // Create default labels based on current module fields
    const defaultLabels: Record<string, string> = {};
    currentModule.fields.forEach((field) => {
      defaultLabels[field.key] = field.default;
    });

    // If we have customization data, override with actual values
    if (customizationQuery.data) {
      currentModule.fields.forEach((field) => {
        const value = (customizationQuery.data as any)?.[field.key];
        if (value) {
          defaultLabels[field.key] = value;
        }
      });
    }

    setLabels(defaultLabels);
  }, [customizationQuery.data, currentModule]);

  // Debounced autosave: Save changes 1.5 seconds after user stops typing
  useEffect(() => {
    if (!selectedCompanyId || !currentModule) return;

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Build the data to save (only include fields that have values)
    const dataToSave: Record<string, string | undefined> = {};
    currentModule.fields.forEach((field) => {
      dataToSave[field.key] = labels[field.key] || undefined;
    });

    // Only save if labels have actually changed from the loaded data
    let hasChanges = false;
    currentModule.fields.forEach((field) => {
      const currentValue = labels[field.key] || "";
      const loadedValue = (customizationQuery.data as any)?.[field.key] || "";
      if (currentValue !== loadedValue) {
        hasChanges = true;
      }
    });

    if (!hasChanges) return;

    // Set new timer
    setSaveStatus("saving");
    debounceTimerRef.current = setTimeout(() => {
      upsertMutation.mutate({
        companyId: selectedCompanyId,
        moduleName: selectedModuleId,
        label1: labels.label1,
        label2: labels.label2,
        label3: labels.label3,
        label4: labels.label4,
        label5: labels.label5,
      });
    }, 1500); // 1.5 second debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [labels, selectedCompanyId, selectedModuleId, customizationQuery.data, upsertMutation, currentModule]);

  const handleLabelChange = (key: string, value: string) => {
    setLabels((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const selectedCompany = allCompanies.find((c) => c.id === selectedCompanyId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personalizar Módulos</CardTitle>
        <CardDescription>
          Personaliza los labels de los módulos para cada empresa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Company Selection */}
        <div className="space-y-3">
          <Label htmlFor="company-select">Seleccionar Empresa</Label>
          <select
            id="company-select"
            className="w-full px-3 py-2 border rounded-md text-sm"
            value={selectedCompanyId || ""}
            onChange={(e) => {
              const companyId = parseInt(e.target.value);
              setSelectedCompanyId(companyId || null);
            }}
            disabled={isLoadingCompanies}
          >
            <option value="">-- Selecciona una empresa --</option>
            {allCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {/* Module Selection */}
        {selectedCompanyId && (
          <div className="space-y-3">
            <Label htmlFor="module-select">Seleccionar Módulo a Personalizar</Label>
            <select
              id="module-select"
              className="w-full px-3 py-2 border rounded-md text-sm"
              value={selectedModuleId}
              onChange={(e) => setSelectedModuleId(e.target.value)}
            >
              {MODULES.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.name}
                </option>
              ))}
            </select>
            {currentModule && (
              <p className="text-sm text-slate-600">{currentModule.description}</p>
            )}
          </div>
        )}

        {/* Customization Form */}
        {selectedCompanyId && currentModule && (
          <div className="space-y-6 border-t pt-6">
            {/* Status Indicator - More subtle */}
            <div className="flex items-center gap-2 min-h-6">
              {saveStatus === "saving" && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <div className="w-3 h-3 rounded-full bg-slate-400 animate-pulse" />
                  <span>Guardando...</span>
                </div>
              )}
              {saveStatus === "saved" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardado</span>
                </div>
              )}
              {saveStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>Error al guardar</span>
                </div>
              )}
            </div>

            {/* Module Customization Fields */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">
                  Módulo: {currentModule.name}
                </Label>
              </div>

              {/* Render fields based on module configuration */}
              {currentModule.fields.map((field, index) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.default}
                    {field.key === "label4" || field.key === "label5" ? " (opcional)" : ""}
                  </Label>
                  <Input
                    id={field.key}
                    value={labels[field.key] || ""}
                    onChange={(e) => handleLabelChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            {/* Info Alert */}
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-800">
                Los cambios se guardan automáticamente 1.5 segundos después de dejar de escribir. Solo tú como administrador puedes realizar estos cambios.
              </AlertDescription>
            </Alert>

            {/* Preview */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <p className="font-semibold text-sm">Vista previa:</p>
              <div className={`grid gap-3 ${currentModule.fields.length > 3 ? "grid-cols-2" : "grid-cols-3"}`}>
                {currentModule.fields.map((field) => (
                  labels[field.key] && (
                    <div key={field.key} className="bg-white p-3 rounded border">
                      <p className="text-xs text-slate-600">{field.default}</p>
                      <p className="font-semibold text-sm">{labels[field.key]}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        )}

        {!selectedCompanyId && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800">
              Selecciona una empresa para personalizar sus módulos.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
