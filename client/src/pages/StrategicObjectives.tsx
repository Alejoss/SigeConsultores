import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Plus, Trash2, AlertCircle, Edit2, Download, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { getAxisBackPathForRole } from "@/lib/sessionScope";
import { exportStrategicObjectivesToPDF } from "@/lib/exportStrategicObjectivesToPDF";
import { CompanyReadOnlyNotice, useCompanyManagementPermission } from "@/hooks/useCompanyManagementPermission";
import { StrategicObjectiveCreate } from "@/components/strategic-measurement/StrategicObjectiveCreate";
import { StrategicObjectiveDetail, type StrategicObjectiveDetailHandle } from "@/components/strategic-measurement/StrategicObjectiveDetail";
import { isStrategicMeasurementConfigured } from "@shared/strategicObjectiveMeasurement";

const MAX_OBJECTIVES = 20;

export default function StrategicObjectives() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const [companyId, setCompanyIdState] = useState<number | null>(() => {
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    const managerId = localStorage.getItem("managerCompanyId");
    return managerId ? parseInt(managerId) : getCompanyIdFromLocationOrStorage();
  });
  const [companyName] = useState(() => processLeaderSession?.companyName || localStorage.getItem("selectedCompanyName") || "Empresa");
  const { canManageCompany } = useCompanyManagementPermission(companyId);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const detailRef = useRef<StrategicObjectiveDetailHandle>(null);
  const switching = useRef(false);
  async function selectObjective(next: number | null) {
    if (switching.current) return;
    switching.current = true;
    const saved = !detailRef.current || await detailRef.current.flush();
    switching.current = false;
    if (saved) setExpandedId(next);
  }
  async function navigate(path: string) {
    if (!detailRef.current || await detailRef.current.flush()) setLocation(path);
  }
  useEffect(() => {
    if (processLeaderSession?.companyId) setCompanyIdState(processLeaderSession.companyId);
  }, [processLeaderSession?.companyId]);
  const { data: objectives = [], isLoading, error, refetch } = trpc.strategicObjectives.list.useQuery(
    { companyId: companyId || 0 }, { enabled: Boolean(companyId) }
  );
  const deleteMutation = trpc.strategicObjectives.delete.useMutation({
    onSuccess: () => { toast.success("Objetivo eliminado"); void refetch(); },
    onError: cause => toast.error(cause.message || "Error al eliminar el objetivo"),
  });
  async function handleDeleteObjective(objectiveId: number) {
    if (!canManageCompany) return;
    if (confirm("¿Estás seguro de que deseas eliminar este objetivo?")) {
      try { await deleteMutation.mutateAsync({ objectiveId }); }
      catch { /* The mutation displays the error without losing the current draft. */ }
    }
  }

  if (!companyId) return <DashboardLayout><Card><CardContent className="pt-6">
    <div className="flex items-center gap-3 text-slate-600"><AlertCircle size={20} /><p>Por favor, selecciona una empresa primero desde el Dashboard</p></div>
    <Button className="w-full mt-4" onClick={() => setLocation("/company")}>Ir a Gestión de Empresas</Button>
  </CardContent></Card></DashboardLayout>;

  return <DashboardLayout>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Objetivos Estratégicos</h1><p className="text-slate-600 mt-2">Define los objetivos estratégicos de <strong>{companyName}</strong> (máximo {MAX_OBJECTIVES})</p></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => {
            try { exportStrategicObjectivesToPDF(objectives); toast.success("PDF descargado exitosamente"); }
            catch { toast.error("Error al descargar el PDF"); }
          }} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Download size={16} />EXPORTAR OBJETIVOS</Button>
          <Button variant="outline" onClick={() => void navigate(`/strategic-objectives-documents?companyId=${companyId}`)}>Documentos</Button>
          <Button variant="outline" onClick={() => void navigate(getAxisBackPathForRole())}>← Volver</Button>
        </div>
      </div>
      {!canManageCompany && <CompanyReadOnlyNotice />}
      {canManageCompany && showForm && <StrategicObjectiveCreate companyId={companyId} orderIndex={objectives.length} onClose={() => setShowForm(false)} onCreated={() => void refetch()} />}
      {canManageCompany && !showForm && <Button onClick={() => setShowForm(true)} disabled={isLoading || Boolean(error) || objectives.length >= MAX_OBJECTIVES} className="w-full bg-blue-600 hover:bg-blue-700"><Plus size={20} />Agregar Nuevo Objetivo</Button>}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Objetivos ({isLoading ? "..." : objectives.length}/{MAX_OBJECTIVES})</h2>
        {isLoading ? <Card><CardContent className="pt-6 flex justify-center gap-2"><Loader2 size={20} className="animate-spin" />Cargando objetivos...</CardContent></Card>
          : error ? <p role="alert" className="text-red-700">No se pudieron cargar los objetivos. <Button variant="outline" onClick={() => void refetch()}>Reintentar</Button></p>
          : objectives.length === 0 ? <Card><CardContent className="pt-6 text-center py-8 text-slate-500"><p>No hay objetivos estratégicos agregados aún.</p><p className="text-sm mt-2">Agrega objetivos para definir la dirección estratégica de tu empresa.</p></CardContent></Card>
          : objectives.map(objective => {
            const configured = isStrategicMeasurementConfigured(objective.measurementConfig);
            const label = !configured ? "Pendiente de configuración" : objective.percent === null ? "Sin medición" : `${objective.percent}% de avance real`;
            return <div key={objective.id} className="space-y-3">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader><CardTitle className="text-lg">{objective.name}</CardTitle>{objective.description && <CardDescription className="mt-2 whitespace-pre-wrap">{objective.description}</CardDescription>}</CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 text-sm">
                    {objective.target && <div><p className="font-semibold text-slate-600">Meta</p><p>{objective.target}</p></div>}
                    {objective.responsible && <div><p className="font-semibold text-slate-600">Responsable</p><p>{objective.responsible}</p></div>}
                    {objective.deadline && <div><p className="font-semibold text-slate-600">Fecha Límite</p><p>{objective.deadline.slice(0, 10)}</p></div>}
                  </div>
                  <p className="text-sm text-slate-600 mb-3">{label} · Ponderación: {objective.measurementConfig?.weight == null ? "Sin definir" : `${objective.measurementConfig.weight}%`}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void selectObjective(expandedId === objective.id ? null : objective.id)} className="flex-1" aria-expanded={expandedId === objective.id}>
                      {canManageCompany && <Edit2 size={16} />}{expandedId === objective.id ? "Cerrar detalle" : canManageCompany ? "Editar definición e indicador" : "Ver definición e indicador"}
                    </Button>
                    {canManageCompany && <Button size="sm" variant="ghost" aria-label={`Eliminar ${objective.name}`} onClick={() => void handleDeleteObjective(objective.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50" disabled={deleteMutation.isPending || expandedId === objective.id}><Trash2 size={16} /></Button>}
                  </div>
                </CardContent>
              </Card>
              {expandedId === objective.id && <StrategicObjectiveDetail mode="definition" detailRef={detailRef} key={`${companyId}-${objective.id}`} companyId={companyId} objectiveId={objective.id} canManage={canManageCompany} onClose={() => setExpandedId(null)} />}
            </div>;
          })}
      </div>
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader><CardTitle className="text-lg text-blue-900">Consejos para Definir Objetivos Estratégicos</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-800">
          <p>Los objetivos deben ser SMART: Específicos, Medibles, Alcanzables, Relevantes y con Tiempo definido.</p>
          <p>Alinea los objetivos con la visión y misión de la empresa y define responsables claros.</p>
          <p>Define un indicador con punto de partida, meta numérica, unidad y fecha. Sus ponderaciones deben sumar 100%.</p>
          <p>Registra los valores reales en Desempeño → Objetivos Estratégicos; allí también puedes consultar el historial y la contribución de los OTE por área.</p>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>;
}
