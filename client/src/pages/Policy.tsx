import { useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useSearch } from "wouter";
import { Download, Save, AlertCircle, Target, Loader2 } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";

import { exportPolicyToPDF } from "@/lib/exportPolicyToPDF";
import { getAxisBackPath } from "@/lib/sessionScope";

const POLICY_TEMPLATE = `POLÍTICA DEL SISTEMA INTEGRADO DE GESTIÓN

1. PROPÓSITO
[Describe el propósito de tu Sistema Integrado de Gestión]

2. ALCANCE
[Define el alcance de la política - procesos, áreas, ubicaciones]

3. PRINCIPIOS FUNDAMENTALES

3.1 Compromiso con la Calidad
Nos comprometemos a proporcionar productos y servicios de calidad superior que cumplan y superen las expectativas de nuestros clientes.

3.2 Cumplimiento Legal y Regulatorio
Garantizamos el cumplimiento de todas las leyes, regulaciones y requisitos aplicables en nuestras operaciones.

3.3 Mejora Continua
Implementamos procesos de mejora continua para optimizar nuestras operaciones y eficiencia.

3.4 Satisfacción del Cliente
Priorizamos la satisfacción del cliente en todas nuestras decisiones y acciones.

3.5 Responsabilidad Ambiental y Social
Operamos de manera responsable con el medio ambiente y la sociedad.

3.6 Seguridad y Salud Ocupacional
Proporcionamos un ambiente de trabajo seguro y saludable para todos nuestros colaboradores.

4. OBJETIVOS ESTRATÉGICOS
[Aquí se definen los objetivos principales del SIGE]

5. RESPONSABILIDADES
[Define las responsabilidades de la alta dirección, gerentes y colaboradores]

6. RECURSOS
[Describe los recursos asignados para implementar el SIGE]

7. REVISIÓN Y ACTUALIZACIÓN
Esta política será revisada anualmente o cuando sea necesario.

Aprobado por:
_________________________
Firma y Fecha`;

export default function Policy() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  
  // Check if this is being accessed by a manager
  const urlParams = new URLSearchParams(search);
  const isManagerAccess = urlParams.get('isManager') === 'true';
  
  const [companyId, setCompanyIdState] = useState<number | null>(() => {
    // If Process Leader, use their company ID from session
    if (isProcessLeader && processLeaderSession?.companyId) {
      return processLeaderSession.companyId;
    }
    return getCompanyIdFromLocationOrStorage();
  });
  const [companyName] = useState(() => processLeaderSession?.companyName || localStorage.getItem("selectedCompanyName") || "Empresa");
  
  // Update companyId when process leader session changes
  useEffect(() => {
    if (isProcessLeader && processLeaderSession?.companyId) {
      setCompanyIdState(processLeaderSession.companyId);
    }
  }, [isProcessLeader, processLeaderSession?.companyId]);
  
  // Show loading if companyId is not set yet
  if (!companyId) {
    if (isProcessLeader === null || (isProcessLeader && !processLeaderSession?.companyId)) {
      return (
        <DashboardLayout>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-slate-600">
                <Loader2 size={20} className="animate-spin" />
                <p>Cargando sesión...</p>
              </div>
            </CardContent>
          </Card>
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <AlertCircle size={20} />
              <p>Por favor, selecciona una empresa primero desde el Dashboard</p>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }
  
  // Back button handler
  const handleBack = () => {
    setLocation(isProcessLeader ? "/process-leader-dashboard" : (isManagerAccess ? getAxisBackPath("/manager-dashboard") : "/dashboard"));
  };
  const [policy, setPolicy] = useState("");
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch policy from database
  const { data: policyData, isLoading, refetch } = trpc.policies.get.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId !== null }
  );

  // Update policy mutation
  const updateMutation = trpc.policies.upsert.useMutation({
    onSuccess: () => {
      setLastSaved(new Date());
      setIsSaving(false);
      refetch();
    },
    onError: (error: any) => {
      setIsSaving(false);
      toast.error(error.message || "Error al guardar la política");
    },
  });

  // Guardado automático con debounce
  const autoSave = () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (policy.trim() && companyId) {
        setIsSaving(true);
        updateMutation.mutate({
          companyId,
          policyText: policy,
        });
      }
    }, 1000);
  };

  const handleSavePolicy = async () => {
    if (!companyId) return;

    await updateMutation.mutateAsync({
      companyId,
      policyText: policy,
    });
  };

  const handleDownloadTemplate = () => {
    const element = document.createElement("a");
    const file = new Blob([POLICY_TEMPLATE], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `Plantilla_Politica_SIGE_${companyName.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success("Plantilla descargada exitosamente");
  };

  const handleLoadTemplate = () => {
    setPolicy(POLICY_TEMPLATE);
    toast.success("Plantilla cargada en el editor");
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
              onClick={() => setLocation("/company")}
            >
              Ir a Gestión de Empresas
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const currentPolicy = policy || policyData?.policyText || "";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Política del Sistema Integrado de Gestión</h1>
            <p className="text-slate-600 mt-2">
              Documenta la política que guía el SIGE de <strong>{companyName}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                try {
                  exportPolicyToPDF(currentPolicy, companyName);
                  toast.success("PDF descargado exitosamente");
                } catch (error) {
                  toast.error("Error al descargar el PDF");
                }
              }}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download size={16} />
              EXPORTAR POLÍTICA
            </Button>
            <Button
              variant="outline"
              onClick={handleBack}
            >
              ← Volver
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Política SIGE</CardTitle>
            <CardDescription>
              Escribe la política que establece los principios y compromisos de tu empresa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-center text-slate-600">Cargando política...</p>
            ) : (
              <>
                <Textarea
                  placeholder="Escribe la política de tu Sistema Integrado de Gestión..."
                  value={currentPolicy}
                  onChange={(e) => {
                    setPolicy(e.target.value);
                    autoSave();
                  }}
                  className="min-h-[400px] font-sans text-sm"
                />

                {isSaving && (
                  <p className="text-xs text-slate-500">Guardando...</p>
                )}
                {lastSaved && (
                  <p className="text-xs text-green-600">Guardado automáticamente a las {lastSaved.toLocaleTimeString()}</p>
                )}

                <div className="bg-blue-50 border border-blue-200 p-4 rounded">
                  <p className="text-sm text-blue-900">
                    💡 <strong>Sugerencia:</strong> La política debe incluir:
                  </p>
                  <ul className="text-sm text-blue-900 mt-2 ml-4 list-disc space-y-1">
                    <li>Compromiso con la calidad</li>
                    <li>Cumplimiento legal y regulatorio</li>
                    <li>Mejora continua</li>
                    <li>Satisfacción del cliente</li>
                    <li>Responsabilidad ambiental y social</li>
                    <li>Seguridad y salud ocupacional</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Button
                    onClick={handleSavePolicy}
                    disabled={!currentPolicy.trim() || updateMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save size={20} />
                    Guardar Política
                  </Button>
                  <Button
                    onClick={() => {
                      localStorage.setItem("selectedPolicyId", companyId.toString());
                      setLocation("/policy-objectives");
                    }}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white"
                  >
                    <Target size={20} />
                    Objetivos de la Política
                  </Button>
                  <Button
                    onClick={() => setLocation("/policy-documents")}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Download size={20} />
                    Documentos de Políticas
                  </Button>
                  <Button
                    onClick={handleDownloadTemplate}
                    variant="outline"
                  >
                    <Download size={20} />
                    Descargar Plantilla
                  </Button>
                </div>

                {!currentPolicy && (
                  <Button
                    onClick={handleLoadTemplate}
                    variant="secondary"
                    className="w-full"
                  >
                    Cargar Plantilla en Editor
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>


      </div>
    </DashboardLayout>
  );
}
