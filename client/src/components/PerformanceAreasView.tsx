import { useLocation, useSearch } from 'wouter';
import { ArrowRight, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { positiveScopeId, selectNavigationProcess } from '@/lib/processQuickNavigation';
import { getPerformanceHref, getPerformanceIndicatorHref, PERFORMANCE_AREA_LABELS, type PerformanceAreaView } from '@/lib/performanceAreaNavigation';
import { PerformanceAreaDetail } from './PerformanceAreaDetail';

export function PerformanceAreaTabs({ companyId, view }: { companyId: number; view: PerformanceAreaView }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const areas = new URLSearchParams(search).get('tab') === 'areas';
  return <nav aria-label={`Vistas de ${PERFORMANCE_AREA_LABELS[view].title}`} className="mb-6 flex flex-wrap gap-2">
    <Button size="sm" variant={areas ? 'secondary' : 'default'} aria-pressed={!areas} className="rounded-full" onClick={() => navigate(getPerformanceHref(companyId, view, 'overview'))}>Resumen general</Button>
    <Button size="sm" variant={areas ? 'default' : 'secondary'} aria-pressed={areas} className="h-auto max-w-full whitespace-normal rounded-full py-2 text-left" onClick={() => navigate(getPerformanceHref(companyId, view))}>{PERFORMANCE_AREA_LABELS[view].tab}</Button>
  </nav>;
}
export function PerformanceAreasView({ companyId, view, onBack }: { companyId: number; view: PerformanceAreaView; onBack: () => void }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const processId = positiveScopeId(new URLSearchParams(search).get('area'));
  const query = trpc.processMap.list.useQuery({ companyId }, { enabled: companyId > 0, retry: false, placeholderData: () => undefined });
  const title = PERFORMANCE_AREA_LABELS[view].title;
  if (processId && (view === 'sgi' || view === 'staff')) return <PerformanceAreaDetail view={view} companyId={companyId} processId={processId} onBack={() => navigate(getPerformanceHref(companyId, view))} />;
  const processes = [...(query.data || [])].filter(process => process.companyId === companyId).sort((a,b) => a.name.localeCompare(b.name,'es'));
  return <div className="min-w-0">
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" onClick={onBack}>← Volver</Button>
      <h2 className="break-words text-xl font-bold text-slate-800">{title}</h2>
    </div>
    <PerformanceAreaTabs companyId={companyId} view={view} />
    <section aria-label={PERFORMANCE_AREA_LABELS[view].tab} className="space-y-4">
      <p className="text-sm text-slate-600">Selecciona un área para consultar su {view === 'otg' ? 'indicador de OTG' : view === 'gpi' ? 'indicador de Partes Interesadas' : view === 'sgi' ? 'detalle de responsabilidades SIG' : 'desempeño de personal'}. Solo aparecen las áreas autorizadas para tu acceso.</p>
      {query.isLoading ? <div role="status" className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> : query.error ? <p role="alert" className="rounded-lg border border-red-200 p-4 text-red-700">No se pudieron cargar las áreas autorizadas. <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></p> : processes.length === 0 ? <p className="py-8 text-center text-slate-500">No hay áreas disponibles para tu acceso.</p> : <div className="grid gap-3 sm:grid-cols-2">
        {processes.map(process => <button key={process.id} type="button" className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-blue-500" onClick={() => {
          selectNavigationProcess(process);
          navigate(view === 'otg' || view === 'gpi' ? getPerformanceIndicatorHref(companyId,process.id,view) : getPerformanceHref(companyId,view,'areas',process.id));
        }}>
          <Building2 className="shrink-0 text-blue-600" size={22} />
          <span className="min-w-0 flex-1"><span className="block break-words font-semibold text-slate-800">{process.name}</span><span className="mt-1 block text-xs text-slate-500">{view === 'otg' || view === 'gpi' ? 'Ver indicador del área' : 'Ver detalle del área'}</span></span>
          <ArrowRight className="shrink-0 text-slate-400" size={18} />
        </button>)}
      </div>}
    </section>
  </div>;
}
