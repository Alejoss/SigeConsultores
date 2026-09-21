import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  Compass,
  FileText,
  Network,
  Target,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import ProceduresCharacterization from "./ProceduresCharacterization";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useEffect, useRef, useState } from "react";
import { getAxisBackPathForRole } from "@/lib/sessionScope";
import { toast } from "sonner";
import { ActivePlanningCycleBadge } from "@/components/ActivePlanningCycleBadge";
import { ProcessCharacterizationCopyDialog } from "@/components/ProcessCharacterizationCopyDialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ProcessData {
  macroProcess: string;
  responsible: string;
  responsibleEmail: string;
  participants: string;
  objective: string;
  scope: string;
  resources: string;
}

type CharacterizationModule = {
  id: string;
  label: string;
  icon: string;
};

type CharacterizationModuleGroup = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  modules: CharacterizationModule[];
};

const CHARACTERIZATION_MODULE_GROUPS: CharacterizationModuleGroup[] = [
  {
    id: "proceso-subprocesos",
    label: "Proceso y subprocesos",
    description: "Estructura operativa y documentación del proceso",
    icon: Network,
    modules: [
      { id: "participantes", label: "Participantes", icon: "👥" },
      { id: "recursos", label: "Recursos", icon: "📦" },
      { id: "subprocesos", label: "Mapa de Subprocesos", icon: "📊" },
      {
        id: "criticidad",
        label: "Gestión con Partes Interesadas",
        icon: "⚠️",
      },
      { id: "procedimientos", label: "Procedimientos", icon: "📄" },
    ],
  },
  {
    id: "objetivos-gestion",
    label: "Objetivos tácticos de gestión",
    description: "Análisis y objetivos del desempeño del proceso",
    icon: Target,
    modules: [
      { id: "foda", label: "FODA", icon: "🎯" },
      { id: "matriz", label: "Objetivos Tácticos de Gestión", icon: "📋" },
    ],
  },
  {
    id: "objetivos-estrategicos",
    label: "Objetivos tácticos estratégicos",
    description: "Conexión del proceso con la estrategia institucional",
    icon: Compass,
    modules: [
      {
        id: "objetivos",
        label: "Gestionar objetivos estratégicos",
        icon: "🎪",
      },
    ],
  },
  {
    id: "gestion-operativa",
    label: "Gestión operativa",
    description: "Responsabilidades, compromisos y reuniones del proceso",
    icon: ClipboardCheck,
    modules: [
      { id: "cumplimientos", label: "Actividades", icon: "✅" },
      {
        id: "compromisos-vinculados",
        label: "Compromisos vinculados",
        icon: "🔗",
      },
      { id: "reuniones", label: "Reuniones", icon: "🤝" },
    ],
  },
  {
    id: "seguimiento-control",
    label: "Seguimiento y control",
    description: "Planificación, indicadores y seguimiento consolidado",
    icon: ChartNoAxesCombined,
    modules: [
      { id: "cronograma", label: "Cronograma Consolidado", icon: "📅" },
      { id: "indicadores", label: "Indicadores", icon: "📈" },
      { id: "ciclos", label: "Ciclos de Planificación", icon: "🔄" },
    ],
  },
];

const CHARACTERIZATION_MODULES = CHARACTERIZATION_MODULE_GROUPS.flatMap(
  group => group.modules
);

export default function ProcessCharacterization() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isManagerAccess =
    localStorage.getItem("managerCompanyId") !== null || isManagerLogin;
  const isProcessLeader = processLeaderSession !== null;

  // La dirección de navegación tiene prioridad para evitar una espera innecesaria
  // al cargar Caracterización; el almacenamiento local queda sólo como respaldo.
  const routeParams = new URLSearchParams(window.location.search);
  const companyId =
    routeParams.get("companyId") || localStorage.getItem("selectedCompanyId");
  const selectedProcessId =
    routeParams.get("processId") || localStorage.getItem("selectedProcessId");
  // Se resuelve de forma síncrona: antes se esperaba un ciclo extra de React
  // para obtener este mismo dato y eso mantenía la pantalla en "Cargando...".
  const parsedProcessId = selectedProcessId
    ? Number.parseInt(selectedProcessId, 10)
    : NaN;
  const processId = Number.isFinite(parsedProcessId) ? parsedProcessId : null;
  const [processName, setProcessName] = useState("");
  const [macroProcessName, setMacroProcessName] = useState("");
  const [macroProcessEditable, setMacroProcessEditable] = useState("");
  const [activeModule, setActiveModule] = useState("datos");
  const [openModuleGroups, setOpenModuleGroups] = useState<
    Record<string, boolean>
  >({
    "proceso-subprocesos": false,
    "objetivos-gestion": false,
    "objetivos-estrategicos": false,
    "gestion-operativa": false,
    "seguimiento-control": false,
  });
  const [data, setData] = useState<ProcessData>({
    macroProcess: "",
    responsible: "",
    responsibleEmail: "",
    participants: "",
    objective: "",
    scope: "",
    resources: "",
  });
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>("");
  const hasHydratedInitialDataRef = useRef(false);

  // selectedProcessId is already declared above

  // Check if user is a Process Owner and get their assigned processes
  const userProcessOwnersQuery =
    trpc.hierarchicalAccess.processOwners.getByUser.useQuery(
      { userId: user?.id || 0 },
      {
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      }
    );

  // Fetch process details
  const { data: processDetails, isLoading: processLoading } =
    trpc.processMap.get.useQuery(
      { processId: selectedProcessId ? parseInt(selectedProcessId) : 0 },
      {
        enabled: !!selectedProcessId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      }
    );

  // Fetch characterization data
  const { data: characterization, isLoading: charLoading } =
    trpc.processCharacterization.getByProcessId.useQuery(
      { processId: selectedProcessId ? parseInt(selectedProcessId) : 0 },
      {
        enabled: !!selectedProcessId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      }
    );

  // Update mutation
  const updateMutation = trpc.processCharacterization.update.useMutation({
    onSuccess: result => {
      // Update local state directly instead of invalidating to avoid race conditions
      if (result) {
        setData({
          macroProcess: result.macroProcess || "",
          responsible: result.responsible || "",
          responsibleEmail: (result as any).responsibleEmail || "",
          participants: result.participants || "",
          objective: result.objective || "",
          scope: result.scope || "",
          resources: result.resources || "",
        });
      }
    },
  });

  useEffect(() => {
    if (selectedProcessId) {
      const processIdNum = parseInt(selectedProcessId);

      // Check if user is a Process Owner
      if (
        userProcessOwnersQuery.data &&
        userProcessOwnersQuery.data.length > 0
      ) {
        const assignedProcessIds = userProcessOwnersQuery.data.map(
          po => po.processId
        );

        // If user is a Process Owner but doesn't have access to this process, redirect
        if (!assignedProcessIds.includes(processIdNum)) {
          console.warn(
            "[ProcessCharacterization] User does not have access to this process"
          );
          if (isProcessLeader) {
            setLocation("/process-leader-dashboard");
          } else {
            setLocation(isManagerAccess ? "/axis-gestion" : "/process-map");
          }
          return;
        }
      }
    }
  }, [
    selectedProcessId,
    userProcessOwnersQuery.data,
    setLocation,
    isProcessLeader,
    isManagerAccess,
  ]);

  // Auto-fill process name from processDetails
  useEffect(() => {
    if (processDetails) {
      setProcessName(processDetails.name || "");
      setMacroProcessName(processDetails.macroProcess || "");
    }
  }, [processDetails]);

  // Hidratación inicial: al abrir, los valores recibidos nunca deben activar autosave.
  // Antes la pantalla enviaba una actualización vacía mientras aún llegaban los datos.
  useEffect(() => {
    if (charLoading || hasHydratedInitialDataRef.current) return;

    const newData = {
      macroProcess: characterization?.macroProcess || "",
      responsible: characterization?.responsible || "",
      responsibleEmail: (characterization as any)?.responsibleEmail || "",
      participants: characterization?.participants || "",
      objective: characterization?.objective || "",
      scope: characterization?.scope || "",
      resources: characterization?.resources || "",
    };
    const initialMacroProcess =
      characterization?.macroProcess || processDetails?.macroProcess || "";
    setData(newData);
    setMacroProcessEditable(initialMacroProcess);
    lastSavedDataRef.current = JSON.stringify({
      ...newData,
      macroProcess: initialMacroProcess,
    });
    hasHydratedInitialDataRef.current = true;
  }, [characterization, processDetails, charLoading]);

  // Auto-save data cuando hay cambios reales
  useEffect(() => {
    if (!processId || !hasHydratedInitialDataRef.current) return;

    const currentData = {
      macroProcess: macroProcessEditable,
      responsible: data.responsible,
      responsibleEmail: data.responsibleEmail,
      participants: data.participants,
      objective: data.objective,
      scope: data.scope,
      resources: data.resources,
    };

    const currentDataStr = JSON.stringify(currentData);

    // Si no hay cambios, no hacer nada
    if (currentDataStr === lastSavedDataRef.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      setIsAutoSaving(true);
      try {
        await updateMutation.mutateAsync({
          processId,
          macroProcess: macroProcessEditable,
          responsible: data.responsible,
          responsibleEmail: data.responsibleEmail,
          participants: data.participants,
          objective: data.objective,
          scope: data.scope,
          resources: data.resources,
        });
        lastSavedDataRef.current = currentDataStr;
        setLastSaved(new Date());
        console.log("Datos Generales guardados automáticamente");
      } catch (error) {
        console.error("Error auto-saving:", error);
      } finally {
        setIsAutoSaving(false);
      }
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [data, macroProcessEditable, processId]);

  const handleSave = async () => {
    if (!processId) return;

    try {
      const dataToSave = {
        processId,
        macroProcess: macroProcessEditable,
        responsible: data.responsible,
        responsibleEmail: data.responsibleEmail,
        participants: data.participants,
        objective: data.objective,
        scope: data.scope,
        resources: data.resources,
      };

      await updateMutation.mutateAsync(dataToSave);
      lastSavedDataRef.current = JSON.stringify(dataToSave);
      toast.success("✓ Datos Generales guardados exitosamente");
      setMacroProcessName(macroProcessEditable);
      setLastSaved(new Date());
    } catch (error) {
      console.error("Error saving characterization:", error);
      toast.error("✗ Error al guardar los datos");
    }
  };

  const handleModuleClick = (moduleId: string) => {
    const moduleGroup = CHARACTERIZATION_MODULE_GROUPS.find(group =>
      group.modules.some(module => module.id === moduleId)
    );
    if (moduleGroup) {
      setOpenModuleGroups(current => ({ ...current, [moduleGroup.id]: true }));
    }

    // Build query string with processId and companyId so sub-modules can resolve context
    const pid = selectedProcessId || (processId ? String(processId) : "");
    const cid = companyId || "";
    const qs = pid ? `?processId=${pid}${cid ? `&companyId=${cid}` : ""}` : "";

    const routes: { [key: string]: string } = {
      subprocesos: `/subprocess-map${qs}`,
      criticidad: `/process-stakeholder-criticality${qs}`,
      foda: `/process-foda${qs}`,
      matriz: `/process-risk-matrix${qs}`,
      objetivos: `/process-tactical-objectives${qs}`,
      cumplimientos: `/process-compliances${qs}`,
      cronograma: `/consolidated-schedule${qs}`,
      "compromisos-vinculados": `/linked-commitments${qs}`,
      reuniones: `/process-meetings${qs}`,
      indicadores: `/process-indicators${qs}`,
      participantes: `/process-participants${qs}`,
      recursos: `/process-resources${qs}`,
      ciclos: `/process-planning-cycles${qs}`,
    };

    if (routes[moduleId]) {
      setLocation(routes[moduleId]);
    } else {
      setActiveModule(moduleId);
    }
  };

  // Check if user has access to the process
  const hasAccessError =
    selectedProcessId &&
    userProcessOwnersQuery.data &&
    userProcessOwnersQuery.data.length > 0 &&
    !userProcessOwnersQuery.data.some(
      po => po.processId === parseInt(selectedProcessId)
    );

  if (!processId || hasAccessError) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">
              {hasAccessError
                ? "No tienes acceso a este proceso. Por favor, selecciona uno de tus procesos asignados."
                : "Por favor, selecciona un proceso primero desde el Mapa de Procesos"}
            </p>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation(getAxisBackPathForRole())}
            >
              Volver al Mapa de Procesos
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // La estructura y los módulos pueden mostrarse de inmediato. Los datos del
  // proceso se hidratan en segundo plano en lugar de bloquear toda la pantalla.
  const isLoadingProcessData = processLoading || charLoading;
  const displayedProcessName =
    processName || (isLoadingProcessData ? "Cargando proceso..." : "Proceso");

  return (
    <DashboardLayout>
      <div className="p-6 bg-white min-h-screen">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-blue-900">
              CARACTERIZACIÓN DE PROCESOS
            </h1>
            <ActivePlanningCycleBadge companyId={Number(companyId)} />
          </div>
          {activeModule !== "procedimientos" && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!isProcessLeader &&
                (isManagerAccess || user?.role === "admin") &&
                companyId &&
                processId && (
                  <ProcessCharacterizationCopyDialog
                    companyId={Number(companyId)}
                    sourceProcessId={processId}
                    sourceProcessName={displayedProcessName}
                  />
                )}
              <Button
                variant="outline"
                onClick={() => {
                  if (isProcessLeader) {
                    // Jefe de Proceso: vuelve al mapa con su processId para que el filtro funcione
                    const url =
                      companyId && selectedProcessId
                        ? `/process-map?companyId=${companyId}&processId=${selectedProcessId}`
                        : "/process-map";
                    setLocation(url);
                  } else if (isManagerAccess) {
                    // Gerente: vuelve al mapa SIN processId para ver todos los procesos
                    const url = companyId
                      ? `/process-map?companyId=${companyId}`
                      : "/process-map";
                    setLocation(url);
                  } else {
                    // Admin/usuario normal: vuelve al mapa SIN processId
                    const url = companyId
                      ? `/process-map?companyId=${companyId}`
                      : "/process-map";
                    setLocation(url);
                  }
                }}
                className="gap-2"
              >
                <ArrowLeft size={16} />
                VOLVER
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Módulos */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">PROCESO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="font-semibold text-sm text-blue-900">
                    {displayedProcessName}
                  </p>
                </div>

                <div className="border-t pt-4 mt-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3">
                    CARACTERIZACIÓN DEL PROCESO
                  </p>

                  <Button
                    variant={activeModule === "datos" ? "default" : "outline"}
                    className="w-full min-h-12 justify-start gap-3 text-left"
                    onClick={() => setActiveModule("datos")}
                  >
                    <FileText size={17} aria-hidden="true" />
                    <span className="font-semibold">Datos generales</span>
                  </Button>

                  <div className="mt-3 space-y-2">
                    {CHARACTERIZATION_MODULE_GROUPS.map(group => {
                      const isOpen = openModuleGroups[group.id] ?? false;
                      const containsActiveModule = group.modules.some(
                        module => module.id === activeModule
                      );

                      return (
                        <Collapsible
                          key={group.id}
                          open={isOpen}
                          onOpenChange={open =>
                            setOpenModuleGroups(current => ({
                              ...current,
                              [group.id]: open,
                            }))
                          }
                          className={`rounded-lg border transition-colors ${
                            containsActiveModule
                              ? "border-blue-400 bg-sky-100"
                              : "border-sky-200 bg-sky-100/80"
                          }`}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="block w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-sky-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            >
                              <span className="block min-w-0">
                                <span className="mb-2 flex size-8 items-center justify-center rounded-md border border-sky-200 bg-white/75 text-blue-700 shadow-sm">
                                  <group.icon size={17} aria-hidden="true" />
                                </span>
                                <span className="flex min-w-0 items-start justify-between gap-2">
                                  <span className="min-w-0 text-sm font-semibold text-slate-800">
                                    {group.label}
                                  </span>
                                  <ChevronDown
                                    size={16}
                                    aria-hidden="true"
                                    className={`mt-0.5 shrink-0 text-slate-500 transition-transform duration-200 ${
                                      isOpen ? "rotate-180" : ""
                                    }`}
                                  />
                                </span>
                                <span className="mt-0.5 block text-xs leading-snug text-slate-600">
                                  {group.description}
                                </span>
                              </span>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="border-t border-slate-200 px-2 py-2">
                            <div className="space-y-1">
                              {group.modules.map(module => (
                                <Button
                                  key={module.id}
                                  variant={
                                    activeModule === module.id
                                      ? "default"
                                      : "ghost"
                                  }
                                  size="sm"
                                  className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left text-xs"
                                  onClick={() => handleModuleClick(module.id)}
                                >
                                  <span
                                    className="text-base"
                                    aria-hidden="true"
                                  >
                                    {module.icon}
                                  </span>
                                  <span className="font-medium leading-snug">
                                    {module.label}
                                  </span>
                                </Button>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeModule === "datos" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>DATOS GENERALES</CardTitle>
                    <div className="text-xs text-slate-500">
                      {isLoadingProcessData && (
                        <span className="text-slate-500">
                          Cargando datos...
                        </span>
                      )}
                      {isAutoSaving && (
                        <span className="text-blue-600">⏳ Guardando...</span>
                      )}
                      {lastSaved && !isAutoSaving && (
                        <span className="text-green-600">
                          ✓ Guardado {lastSaved.toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <tbody>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3 w-1/3">
                            PROCESO:
                          </td>
                          <td className="border border-slate-300 p-3 font-semibold text-blue-900">
                            {displayedProcessName}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">
                            MACRO PROCESO:
                          </td>
                          <td className="border border-slate-300 p-3">
                            <Input
                              value={macroProcessEditable}
                              onChange={e =>
                                setMacroProcessEditable(e.target.value)
                              }
                              placeholder="Ingresa el macro proceso"
                              className="border-0 p-0 font-semibold text-blue-900"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">
                            RESPONSABLE DEL PROCESO:
                          </td>
                          <td className="border border-slate-300 p-3">
                            <Input
                              value={data.responsible}
                              onChange={e =>
                                setData({
                                  ...data,
                                  responsible: e.target.value,
                                })
                              }
                              className="border-0 p-0"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">
                            CORREO DEL RESPONSABLE:
                          </td>
                          <td className="border border-slate-300 p-3">
                            <Input
                              type="email"
                              value={data.responsibleEmail}
                              onChange={e =>
                                setData({
                                  ...data,
                                  responsibleEmail: e.target.value,
                                })
                              }
                              placeholder="correo@empresa.com"
                              className="border-0 p-0"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">
                            OBJETIVO DEL PROCESO:
                          </td>
                          <td className="border border-slate-300 p-3">
                            <Textarea
                              value={data.objective}
                              onChange={e =>
                                setData({ ...data, objective: e.target.value })
                              }
                              className="border-0 p-0 min-h-24 resize-none"
                              placeholder="Ingresa el objetivo del proceso"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">
                            ALCANCE:
                          </td>
                          <td className="border border-slate-300 p-3">
                            <Textarea
                              value={data.scope}
                              onChange={e =>
                                setData({ ...data, scope: e.target.value })
                              }
                              className="border-0 p-0 min-h-24 resize-none"
                              placeholder="Ingresa el alcance del proceso"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="mt-6 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {updateMutation.isPending
                      ? "Guardando..."
                      : "Guardar Datos Generales"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {activeModule === "procedimientos" && processId && (
              <ProceduresCharacterization
                processId={processId}
                processName={processName}
                onVolver={() => setActiveModule("datos")}
              />
            )}

            {activeModule !== "datos" &&
              activeModule !== "procedimientos" &&
              activeModule !== "reuniones" && (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-slate-600">
                      Módulo de{" "}
                      {
                        CHARACTERIZATION_MODULES.find(
                          module => module.id === activeModule
                        )?.label
                      }{" "}
                      en desarrollo
                    </p>
                  </CardContent>
                </Card>
              )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
