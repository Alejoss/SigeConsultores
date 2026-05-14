import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export default function ModuleCustomizationPanel() {
  const [, setLocation] = useLocation();
  const [companyId] = useState<number | null>(() => {
    const stored = localStorage.getItem("selectedCompanyId");
    return stored ? parseInt(stored) : null;
  });
  const [companyName] = useState(() => localStorage.getItem("selectedCompanyName") || "Empresa");

  // Fetch current customization
  const { data: customization, isLoading } = trpc.moduleCustomization.get.useQuery(
    { companyId: companyId || 0, moduleName: "purpose_mission_vision" },
    { enabled: companyId !== null }
  );

  // Update customization mutation
  const updateMutation = trpc.moduleCustomization.upsert.useMutation({
    onSuccess: () => {
      toast.success("Personalización guardada exitosamente");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar la personalización");
    },
  });

  const [title, setTitle] = useState("");
  const [label1, setLabel1] = useState("");
  const [label2, setLabel2] = useState("");
  const [label3, setLabel3] = useState("");
  const [label4, setLabel4] = useState("");

  // Initialize form with existing values
  useState(() => {
    if (customization) {
      setTitle(customization.label1 || "Propósito, Misión y Visión");
      setLabel1(customization.label2 || "Propósito");
      setLabel2(customization.label3 || "Misión");
      setLabel3(customization.label4 || "Visión");
      setLabel4(customization.label5 || "");
    }
  });

  const handleSave = async () => {
    if (!companyId) return;

    await updateMutation.mutateAsync({
      companyId,
      moduleName: "purpose_mission_vision",
      label1: title || "Propósito, Misión y Visión",
      label2: label1 || "Propósito",
      label3: label2 || "Misión",
      label4: label3 || "Visión",
      label5: label4 || "",
    });
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

        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-slate-600">Cargando personalización...</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Purpose, Mission, Vision Module */}
            <Card>
              <CardHeader>
                <CardTitle>Propósito, Misión, Visión</CardTitle>
                <CardDescription>
                  Personaliza los labels de este módulo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Título del Módulo</Label>
                  <Input
                    id="title"
                    placeholder="Ej: Propósito, Misión y Visión"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="label1">Label 1 (Propósito)</Label>
                  <Input
                    id="label1"
                    placeholder="Ej: Propósito o ¿Por qué?"
                    value={label1}
                    onChange={(e) => setLabel1(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="label2">Label 2 (Misión)</Label>
                  <Input
                    id="label2"
                    placeholder="Ej: Misión o ¿Cómo?"
                    value={label2}
                    onChange={(e) => setLabel2(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="label3">Label 3 (Visión)</Label>
                  <Input
                    id="label3"
                    placeholder="Ej: Visión o ¿Qué?"
                    value={label3}
                    onChange={(e) => setLabel3(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {updateMutation.isPending ? "Guardando..." : "Guardar Personalización"}
                </Button>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg text-blue-900">Vista Previa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-blue-800">
                <div>
                  <p className="font-semibold text-lg">{title || "Propósito, Misión y Visión"}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <p className="font-semibold">{label1 || "Propósito"}</p>
                    <p className="text-xs text-slate-600">Label 1</p>
                  </div>
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <p className="font-semibold">{label2 || "Misión"}</p>
                    <p className="text-xs text-slate-600">Label 2</p>
                  </div>
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <p className="font-semibold">{label3 || "Visión"}</p>
                    <p className="text-xs text-slate-600">Label 3</p>
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
