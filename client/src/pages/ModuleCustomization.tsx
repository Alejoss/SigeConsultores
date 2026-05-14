import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams } from "wouter";
import { Loader2 } from "lucide-react";

// Default module configurations
const MODULE_CONFIGS = {
  purpose_mission_vision: {
    name: "Propósito, Misión, Visión",
    defaultLabels: ["Propósito", "Misión", "Visión"],
    description: "Personaliza los labels para los fundamentos estratégicos de tu empresa",
  },
  strategic_objectives: {
    name: "Objetivos Estratégicos",
    defaultLabels: ["Objetivo 1", "Objetivo 2", "Objetivo 3"],
    description: "Personaliza los labels para los objetivos estratégicos",
  },
  values: {
    name: "Valores Empresariales",
    defaultLabels: ["Valor 1", "Valor 2", "Valor 3"],
    description: "Personaliza los labels para los valores de tu empresa",
  },
};

type ModuleName = keyof typeof MODULE_CONFIGS;

export default function ModuleCustomization() {
  const { companyId } = useParams();
  const companyIdNum = companyId ? parseInt(companyId) : 0;

  const [selectedModule, setSelectedModule] = useState<ModuleName>("purpose_mission_vision");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Fetch current customization
  const { data: customization, isLoading } = trpc.moduleCustomization.get.useQuery(
    {
      companyId: companyIdNum,
      moduleName: selectedModule,
    },
    { enabled: companyIdNum > 0 }
  );

  // Upsert mutation
  const upsertMutation = trpc.moduleCustomization.upsert.useMutation();

  // Initialize labels when customization loads
  useEffect(() => {
    if (customization) {
      setLabels({
        label1: customization.label1 || MODULE_CONFIGS[selectedModule].defaultLabels[0] || "",
        label2: customization.label2 || MODULE_CONFIGS[selectedModule].defaultLabels[1] || "",
        label3: customization.label3 || MODULE_CONFIGS[selectedModule].defaultLabels[2] || "",
        label4: customization.label4 || "",
        label5: customization.label5 || "",
      });
    } else {
      // Reset to defaults
      const config = MODULE_CONFIGS[selectedModule];
      setLabels({
        label1: config.defaultLabels[0] || "",
        label2: config.defaultLabels[1] || "",
        label3: config.defaultLabels[2] || "",
        label4: "",
        label5: "",
      });
    }
  }, [customization, selectedModule]);

  const handleLabelChange = (labelKey: string, value: string) => {
    setLabels((prev) => ({
      ...prev,
      [labelKey]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await upsertMutation.mutateAsync({
        companyId: companyIdNum,
        moduleName: selectedModule,
        label1: labels.label1 || undefined,
        label2: labels.label2 || undefined,
        label3: labels.label3 || undefined,
        label4: labels.label4 || undefined,
        label5: labels.label5 || undefined,
      });
      setShowPreview(false);
    } finally {
      setIsSaving(false);
    }
  };

  const config = MODULE_CONFIGS[selectedModule];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Personalizar Módulos</h1>
        <p className="text-gray-600 mt-2">Personaliza los labels de los módulos SIGE para tu empresa</p>
      </div>

      {/* Module Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Selecciona un Módulo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.entries(MODULE_CONFIGS) as [ModuleName, typeof MODULE_CONFIGS[ModuleName]][]).map(
              ([moduleKey, moduleConfig]) => (
                <button
                  key={moduleKey}
                  onClick={() => setSelectedModule(moduleKey)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    selectedModule === moduleKey
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <h3 className="font-semibold">{moduleConfig.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{moduleConfig.description}</p>
                </button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Label Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{config.name}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {[1, 2, 3, 4, 5].map((index) => {
                const labelKey = `label${index}` as keyof typeof labels;
                const isRequired = index <= 3; // First 3 labels are required
                return (
                  <div key={labelKey}>
                    <label className="block text-sm font-medium mb-2">
                      Label {index} {isRequired && <span className="text-red-500">*</span>}
                    </label>
                    <Input
                      value={labels[labelKey] || ""}
                      onChange={(e) => handleLabelChange(labelKey, e.target.value)}
                      placeholder={config.defaultLabels[index - 1] || `Label ${index}`}
                      disabled={isRequired && !labels[labelKey]}
                    />
                  </div>
                );
              })}

              {/* Preview Button */}
              <div className="pt-4">
                <Button
                  onClick={() => setShowPreview(!showPreview)}
                  variant="outline"
                  className="w-full"
                >
                  {showPreview ? "Ocultar Preview" : "Ver Preview"}
                </Button>
              </div>

              {/* Preview Section */}
              {showPreview && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-base">Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[1, 2, 3].map((index) => {
                        const labelKey = `label${index}` as keyof typeof labels;
                        return (
                          <div key={labelKey} className="flex items-center gap-2">
                            <span className="text-gray-600">Será mostrado como:</span>
                            <span className="font-semibold text-blue-700">{labels[labelKey]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={isSaving || upsertMutation.isPending}
                  className="flex-1"
                >
                  {isSaving || upsertMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar Cambios"
                  )}
                </Button>
              </div>

              {upsertMutation.isSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
                  ✓ Cambios guardados exitosamente
                </div>
              )}

              {upsertMutation.isError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  Error al guardar: {upsertMutation.error?.message}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
