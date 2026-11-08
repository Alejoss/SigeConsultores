import { useLocation } from "wouter";
import { Loader2, ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { getProcessQuickHref, selectNavigationProcess } from "@/lib/processQuickNavigation";

const processTypes: Record<string, string> = { estrategico: "Proceso estratégico", misional: "Proceso misional", soporte: "Proceso de soporte" };
export function OTEByArea({ companyId }: { companyId: number }) {
  const [, navigate] = useLocation();
  const query = trpc.processMap.list.useQuery({ companyId }, { enabled: companyId > 0, retry: false });
  if (query.isLoading) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (query.error) return <div role="alert" className="p-4 text-red-700">No se pudieron cargar las áreas autorizadas. <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div>;
  const processes = [...(query.data || [])].sort((a, b) => a.name.localeCompare(b.name, "es"));
  return <section className="space-y-4" aria-label="OTE por Área">
    <p className="text-sm text-slate-600">Selecciona un área para consultar directamente su Indicador de OTE. Los resultados de las áreas complementan la medición real de los OE; no la sustituyen.</p>
    {processes.length === 0 ? <p className="py-8 text-center text-slate-500">No hay áreas disponibles para tu acceso.</p> : <div className="grid gap-3 sm:grid-cols-2">
      {processes.map(process => <button type="button" key={process.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-blue-500" onClick={() => { selectNavigationProcess(process); navigate(getProcessQuickHref("indicators", process.id, companyId, "ote", "areas")); }}>
        <Building2 size={22} className="shrink-0 text-blue-600" />
        <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-800 break-words">{process.name}</span><span className="block text-xs text-slate-500 mt-1">{processTypes[process.processType] || "Área de la empresa"} · Ver Indicador de OTE</span></span>
        <ArrowRight size={18} className="shrink-0 text-slate-400" />
      </button>)}
    </div>}
  </section>;
}
