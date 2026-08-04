import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Save, AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { exportTacticalObjectivesToPDF } from "@/lib/exportTacticalObjectivesToPDF";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useModuleLabels } from "@/hooks/useModuleLabels";
import { getAxisBackPathForRole } from "@/lib/sessionScope";

export default function CompanyInfo() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  // Check if this is being accessed by a manager
  const urlParams = new URLSearchParams(search);
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null;
  
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  
  const [companyId, setCompanyIdState] = useState<number | null>(() => {
    // If Process Leader, use their company ID from session
    if (isProcessLeader && processLeaderSession?.companyId) {
      return processLeaderSession.companyId;
    }
    return getCompanyIdFromLocationOrStorage();
  });
  
  // Update companyId when process leader session changes
  useEffect(() => {
    if (isProcessLeader && processLeaderSession?.companyId) {
      setCompanyIdState(processLeaderSession.companyId);
    }
  }, [isProcessLeader, processLeaderSession?.companyId]);
  
  const [proposito, setProposito] = useState("");
  const [mision, setMision] = useState("");
  const [vision, setVision] = useState("");
  const [adminAlertEmail, setAdminAlertEmail] = useState("");
  const [activeTab, setActiveTab] = useState("golden-circle");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Flag para bloquear la sincronización del servidor mientras el usuario está editando.
  // Se activa en onChange y se desactiva cuando el autosave confirma el guardado.
  const isEditingRef = useRef(false);
  const propositoRef = useRef<HTMLTextAreaElement>(null);
  const misionRef = useRef<HTMLTextAreaElement>(null);
  const visionRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea function
  const autoExpandTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }, []);

  // Expand textareas when content changes
  useEffect(() => {
    autoExpandTextarea(propositoRef.current);
  }, [proposito, autoExpandTextarea]);

  useEffect(() => {
    autoExpandTextarea(misionRef.current);
  }, [mision, autoExpandTextarea]);

  useEffect(() => {
    autoExpandTextarea(visionRef.current);
  }, [vision, autoExpandTextarea]);

  // Trigger resize on initial load
  useEffect(() => {
    setTimeout(() => {
      autoExpandTextarea(propositoRef.current);
      autoExpandTextarea(misionRef.current);
      autoExpandTextarea(visionRef.current);
    }, 100);
  }, [autoExpandTextarea]);

  const { getLabel } = useModuleLabels(companyId);

  // Fetch company info from database
  const { data: companyInfo, isLoading, refetch } = trpc.companyInfo.get.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId !== null }
  );

  // Fetch company details for dynamic name
  const { data: companyDetails } = trpc.process.get.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId !== null }
  );

  // Update company info mutation
  const updateMutation = trpc.companyInfo.upsert.useMutation({
    onSuccess: () => {
      setLastSaved(new Date());
      setIsSaving(false);
      refetch();
      toast.success("Información guardada automáticamente");
    },
    onError: (error: any) => {
      setIsSaving(false);
      toast.error(error.message || "Error al guardar la información");
    },
  });

  // Cargar datos iniciales desde la BD.
  // Si el usuario está editando activamente (isEditingRef = true), no sobreescribir el estado local.
  useEffect(() => {
    if (companyInfo && !isEditingRef.current) {
      setProposito(companyInfo.proposito || "");
      setMision(companyInfo.mision || "");
      setVision(companyInfo.vision || "");
      setAdminAlertEmail((companyInfo as any).adminAlertEmail || "");
    }
  }, [companyInfo]);

  // Guardado automático con debounce.
  // Se pasan los valores actuales como parámetros para evitar el problema de closure stale.
  // isEditingRef se activa al empezar a editar y se desactiva cuando el guardado confirma éxito.
  const autoSave = (currentProposito: string, currentMision: string, currentVision: string, currentAdminEmail?: string) => {
    // Marcar que el usuario está editando para bloquear la sincronización del servidor
    isEditingRef.current = true;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (companyId) {
        setIsSaving(true);
        updateMutation.mutate(
          {
            companyId,
            proposito: currentProposito || undefined,
            mision: currentMision || undefined,
            vision: currentVision || undefined,
            ...({
              adminAlertEmail: currentAdminEmail !== undefined ? currentAdminEmail : adminAlertEmail,
            } as any),
          } as any,
          {
            onSuccess: () => {
              // Solo desactivar el flag después de que el guardado se confirme
              isEditingRef.current = false;
            },
          }
        );
      } else {
        // Si no hay contenido que guardar, desactivar el flag igualmente
        isEditingRef.current = false;
      }
    }, 1500); // Esperar 1.5 segundos después de dejar de escribir
  };

  const handleSave = async () => {
    if (!companyId) return;

    setIsSaving(true);
    await updateMutation.mutateAsync({
      companyId,
      proposito: proposito || undefined,
      mision: mision || undefined,
      vision: vision || undefined,
      ...({ adminAlertEmail: adminAlertEmail || undefined } as any),
    } as any);
  };

  if (!companyId) {
    // If Process Leader, show loading while session loads
    if (isProcessLeader === null) {
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

  // Usar nombre dinámico de la empresa
  const companyName = companyDetails?.name || localStorage.getItem("selectedCompanyName") || "Empresa";

  const labels = useMemo(
    () => ({
      title: `${getLabel("purpose_proposito", "Propósito")}, ${getLabel("purpose_mision", "Misión")}, ${getLabel("purpose_vision", "Visión")}`,
      proposito: getLabel("purpose_proposito", "Propósito"),
      mision: getLabel("purpose_mision", "Misión"),
      vision: getLabel("purpose_vision", "Visión"),
    }),
    [getLabel]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{labels.title}</h1>
            <p className="text-slate-600 mt-2">
              Define los fundamentos estratégicos de <strong>{companyName}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                try {
                  exportTacticalObjectivesToPDF(
                    [
                      {
                        subprocess: proposito,
                        strategicObjective: '',
                        enunciation: labels.proposito,
                        explanation: '',
                        responsible: '',
                      },
                      {
                        subprocess: mision,
                        strategicObjective: '',
                        enunciation: labels.mision,
                        explanation: '',
                        responsible: '',
                      },
                      {
                        subprocess: vision,
                        strategicObjective: '',
                        enunciation: labels.vision,
                        explanation: '',
                        responsible: '',
                      },
                    ],
                    companyName
                  );
                  toast.success("PDF descargado exitosamente");
                } catch (error) {
                  toast.error("Error al descargar el PDF");
                }
              }}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download size={16} />
              EXPORTAR {labels.title.split(',')[0].toUpperCase()}
            </Button>
            <Button
              variant="outline"
               onClick={() => setLocation(getAxisBackPathForRole())}
            >
              ← Volver
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-slate-600">Cargando información...</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Propósito */}
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader>
                <CardTitle className="text-lg">{labels.proposito}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  ref={propositoRef}
                  placeholder={`Describe el ${labels.proposito.toLowerCase()} fundamental de tu empresa...`}
                  value={proposito}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setProposito(newValue);
                    autoSave(newValue, mision, vision);
                  }}
                  className="resize-none overflow-hidden"
                />
              </CardContent>
            </Card>

            {/* Misión */}
            <Card className="border-l-4 border-l-green-500">
              <CardHeader>
                <CardTitle className="text-lg">{labels.mision}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  ref={misionRef}
                  placeholder={`Describe la ${labels.mision.toLowerCase()} de tu empresa...`}
                  value={mision}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setMision(newValue);
                    autoSave(proposito, newValue, vision);
                  }}
                  className="resize-none overflow-hidden"
                />
              </CardContent>
            </Card>

            {/* Visión */}
            <Card className="border-l-4 border-l-purple-500">
              <CardHeader>
                <CardTitle className="text-lg">{labels.vision}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  ref={visionRef}
                  placeholder={`Describe la ${labels.vision.toLowerCase()} futura de tu empresa...`}
                  value={vision}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setVision(newValue);
                    autoSave(proposito, mision, newValue);
                  }}
                  className="resize-none overflow-hidden"
                />
              </CardContent>
            </Card>

            {/* Tabs for Information Models */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-lg">
                <TabsTrigger 
                  value="golden-circle"
                  className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900"
                >
                  Modelo Círculo Dorado
                </TabsTrigger>
                <TabsTrigger 
                  value="pmv"
                  className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900"
                >
                  {labels.title}
                </TabsTrigger>
              </TabsList>

              {/* Golden Circle Tab */}
              <TabsContent value="golden-circle">
                <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                  <CardHeader>
                    <CardTitle className="text-lg text-amber-900">Modelo del Círculo Dorado</CardTitle>
                    <p className="text-sm text-amber-800 mt-2">Simon Sinek</p>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-amber-900">
                    <div className="bg-white/50 p-4 rounded-lg border border-amber-100">
                      <p className="font-semibold text-base mb-2">¿Por qué? (Why)</p>
                      <p>La razón de ser de la empresa: su propósito, causa o creencia que la motiva.</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg border border-amber-100">
                      <p className="font-semibold text-base mb-2">¿Cómo? (How)</p>
                      <p>La forma diferenciadora en que la empresa hace lo que hace: procesos, valores y principios.</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg border border-amber-100">
                      <p className="font-semibold text-base mb-2">¿Qué? (What)</p>
                      <p>Lo que la empresa ofrece o produce: productos, servicios o resultados concretos.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PMV Tab */}
              <TabsContent value="pmv">
                <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-lg text-blue-900">Consejos para Definir Estos Elementos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-blue-900">
                    <div className="bg-white/50 p-4 rounded-lg border border-blue-100">
                      <p className="font-semibold text-base mb-2">{labels.proposito}</p>
                      <p>Debe ser inspirador y responder a la pregunta fundamental: ¿por qué existimos?</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg border border-blue-100">
                      <p className="font-semibold text-base mb-2">{labels.mision}</p>
                      <p>Debe ser clara, concisa y describir qué hacemos y para quién lo hacemos.</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg border border-blue-100">
                      <p className="font-semibold text-base mb-2">{labels.vision}</p>
                      <p>Debe ser ambiciosa pero alcanzable, describiendo el futuro deseado de la empresa.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Configuración de Alertas por Correo */}
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span>🔔</span> Alertas de Cronograma
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Correo del Gerente General o Administrador que recibirá el resumen semanal de todas las actividades próximas a vencer en todos los procesos.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <input
                    type="email"
                    value={adminAlertEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAdminAlertEmail(val);
                      autoSave(proposito, mision, vision, val);
                    }}
                    placeholder="gerente@empresa.com"
                    className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Status and Save Button */}
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                {isSaving ? (
                  <>
                    <div className="animate-spin">⏳</div>
                    <span className="text-sm text-slate-600">Guardando...</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <CheckCircle2 size={16} className="text-green-600" />
                    <span className="text-sm text-green-600">
                      Guardado a las {lastSaved.toLocaleTimeString()}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-slate-600">Sin cambios sin guardar</span>
                )}
              </div>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || isSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Save size={20} />
                Guardar Ahora
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
