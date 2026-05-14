import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

const PURPOSE_KEYS = ["purpose_proposito", "purpose_mision", "purpose_vision"] as const;
const PURPOSE_DEFAULTS: Record<(typeof PURPOSE_KEYS)[number], string> = {
  purpose_proposito: "Propósito",
  purpose_mision: "Misión",
  purpose_vision: "Visión",
};

export default function ModuleCustomizationPanel() {
  const [, setLocation] = useLocation();
  const [companyId] = useState<number | null>(() => {
    const stored = localStorage.getItem("selectedCompanyId");
    return stored ? parseInt(stored, 10) : null;
  });
  const [companyName] = useState(() => localStorage.getItem("selectedCompanyName") || "Empresa");

  const [proposito, setProposito] = useState("");
  const [mision, setMision] = useState("");
  const [vision, setVision] = useState("");

  const labelsQuery = trpc.moduleCustomization.getLabels.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId != null && companyId > 0 }
  );

  const updateMutation = trpc.moduleCustomization.upsert.useMutation({
    onSuccess: () => {
      toast.success("Personalización guardada exitosamente");
      void labelsQuery.refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar la personalización");
    },
  });

  useEffect(() => {
    if (!labelsQuery.data) return;
    const data = labelsQuery.data as Record<string, { customLabel?: string | null }>;
    setProposito(
      typeof data.purpose_proposito?.customLabel === "string"
        ? data.purpose_proposito.customLabel
        : ""
    );
    setMision(typeof data.purpose_mision?.customLabel === "string" ? data.purpose_mision.customLabel : "");
    setVision(typeof data.purpose_vision?.customLabel === "string" ? data.purpose_vision.customLabel : "");
  }, [labelsQuery.data]);

  const previewTitle = useMemo(() => {
    const p = proposito.trim() || PURPOSE_DEFAULTS.purpose_proposito;
    const m = mision.trim() || PURPOSE_DEFAULTS.purpose_mision;
    const v = vision.trim() || PURPOSE_DEFAULTS.purpose_vision;
    return `${p}, ${m}, ${v}`;
  }, [proposito, mision, vision]);

  const handleSave = async () => {
    if (!companyId) return;
    await Promise.all(
      PURPOSE_KEYS.map((key) => {
        const val =
          key === "purpose_proposito"
            ? proposito
            : key === "purpose_mision"
              ? mision
              : vision;
        const trimmed = val.trim();
        return updateMutation.mutateAsync({
          companyId,
          moduleName: key,
          label: trimmed === "" ? null : trimmed,
        });
      })
    );
  };

  if (!companyId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <AlertCircle size={20} />
              <p>Por favor, selecciona una empresa primero desde el Dashboard</p>
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation("/manager-dashboard")}
            >
              Ir al Dashboard
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Personalizar Módulos</h1>
            <p className="text-slate-600 mt-2">
              Personaliza los labels de los módulos para <strong>{companyName}</strong>
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setLocation("/manager-dashboard")}
          >
            ← Volver
          </Button>
        </div>

        {labelsQuery.isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-slate-600">Cargando personalización...</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Propósito, Misión, Visión</CardTitle>
                <CardDescription>
                  Tres nombres independientes (cada uno se guarda en su propia fila y sustituye el valor anterior).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="proposito">Nombre de la sección — Propósito</Label>
                  <Input
                    id="proposito"
                    placeholder="Ej: Propósito o ¿Por qué?"
                    value={proposito}
                    onChange={(e) => setProposito(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="mision">Nombre de la sección — Misión</Label>
                  <Input
                    id="mision"
                    placeholder="Ej: Misión o ¿Cómo?"
                    value={mision}
                    onChange={(e) => setMision(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="vision">Nombre de la sección — Visión</Label>
                  <Input
                    id="vision"
                    placeholder="Ej: Visión o ¿Qué?"
                    value={vision}
                    onChange={(e) => setVision(e.target.value)}
                  />
                </div>

                <Button
                  onClick={() => void handleSave()}
                  disabled={updateMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {updateMutation.isPending ? "Guardando..." : "Guardar Personalización"}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg text-blue-900">Vista Previa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-blue-800">
                <div>
                  <p className="font-semibold text-lg">{previewTitle}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <p className="font-semibold">{proposito.trim() || PURPOSE_DEFAULTS.purpose_proposito}</p>
                    <p className="text-xs text-slate-600">Propósito</p>
                  </div>
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <p className="font-semibold">{mision.trim() || PURPOSE_DEFAULTS.purpose_mision}</p>
                    <p className="text-xs text-slate-600">Misión</p>
                  </div>
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <p className="font-semibold">{vision.trim() || PURPOSE_DEFAULTS.purpose_vision}</p>
                    <p className="text-xs text-slate-600">Visión</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
