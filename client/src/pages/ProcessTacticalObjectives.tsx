import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft } from 'lucide-react';
import { ActivePlanningCycleBadge } from "@/components/ActivePlanningCycleBadge";
import { trpc } from "@/lib/trpc";
import { getCompanyIdFromSession, getProcessIdFromSession } from "@/lib/sessionScope";
import { positiveScopeId } from "@/lib/processQuickNavigation";

export default function ProcessTacticalObjectives() {
  const [, setLocation] = useLocation();
  useSearch(); // Re-resolve the existing URL-first helpers on query-only navigation.
  const processId = positiveScopeId(getProcessIdFromSession());
  const companyId = positiveScopeId(getCompanyIdFromSession());
  const process = trpc.processMap.get.useQuery(
    { processId: processId || 0 },
    { enabled: Boolean(processId), retry: false }
  );
  const currentProcess = !process.error && !process.isPlaceholderData && process.data?.id === processId
    && (!companyId || process.data.companyId === companyId) ? process.data : null;
  const processName = currentProcess?.name?.trim() || (processId
    ? (process.isLoading || process.isPending ? "Cargando proceso..." : "Proceso no disponible")
    : "Sin proceso seleccionado");
  const context = new URLSearchParams();
  if (processId) context.set("processId", String(processId));
  const scopedCompanyId = companyId || currentProcess?.companyId;
  if (scopedCompanyId) context.set("companyId", String(scopedCompanyId));
  const scopedPath = (path: string) => context.size ? `${path}?${context}` : path;

  const handleDefinition = () => setLocation(scopedPath('/tactical-definition'));
  const handlePlanning = () => setLocation(scopedPath('/tactical-planning'));
  const handleBack = () => setLocation(scopedPath('/process-characterization'));

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-4xl font-bold text-blue-900 mb-2">OTE - OBJETIVOS TÁCTICOS ESTRATÉGICOS</h1><ActivePlanningCycleBadge companyId={scopedCompanyId || 0} /></div>
            <p className="text-gray-600">Proceso: <span className="font-semibold">{processName}</span></p>
          </div>
          <Button onClick={handleBack} variant="outline" className="flex items-center gap-2">
            <ArrowLeft size={20} />
            VOLVER
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-blue-200" onClick={handleDefinition}>
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-900">Definición de OTE</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-gray-700 mb-4">
                Define los objetivos tácticos estratégicos confrontando los Objetivos de la Política
                con los Objetivos Estratégicos. Especifica el enunciado, explicación y responsable de cada objetivo.
              </p>
              <Button onClick={handleDefinition} className="w-full bg-blue-600 hover:bg-blue-700">
                Ir a Definición
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-green-200" onClick={handlePlanning}>
            <CardHeader className="bg-green-50">
              <CardTitle className="text-green-900">Planificación de OTE</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-gray-700 mb-4">
                Planifica la implementación de los objetivos tácticos estratégicos: metas,
                responsables y resultados clave con seguimiento de fechas y cumplimiento.
              </p>
              <Button onClick={handlePlanning} className="w-full bg-green-600 hover:bg-green-700">
                Ir a Planificación
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
