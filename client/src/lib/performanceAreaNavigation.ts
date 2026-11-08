import { getProcessQuickHref, positiveScopeId } from './processQuickNavigation';
export type PerformanceAreaView = 'otg' | 'gpi' | 'sgi' | 'staff';
export const PERFORMANCE_AREA_LABELS: Record<PerformanceAreaView, { title: string; tab: string }> = {
  otg: { title: 'Objetivos Tácticos de Gestión', tab: 'OTG por Área' },
  gpi: { title: 'Gestión con Partes Interesadas', tab: 'Gestión con Partes Interesadas por Área' },
  sgi: { title: 'Sistemas de Gestión', tab: 'Sistemas de Gestión por Área' },
  staff: { title: 'Desempeño de Personal', tab: 'Desempeño de Personal por Área' },
};
export function isPerformanceAreaView(value: unknown): value is PerformanceAreaView {
  return value === 'otg' || value === 'gpi' || value === 'sgi' || value === 'staff';
}
export function getPerformanceHref(companyId: number, view: PerformanceAreaView, tab: 'overview' | 'areas' = 'areas', processId?: number): string {
  if (!positiveScopeId(companyId)) throw new Error('Selecciona una empresa válida.');
  const params = new URLSearchParams({ companyId: String(companyId), view, tab });
  if ((view === 'sgi' || view === 'staff') && positiveScopeId(processId)) params.set('area', String(processId));
  return `/strategic-trends?${params}`;
}
export function getPerformanceIndicatorHref(companyId: number, processId: number, view: 'otg' | 'gpi'): string {
  const href = getProcessQuickHref('indicators', processId, companyId, view === 'otg' ? 'otg' : 'partes');
  return href + '&performanceReturnView=' + view;
}
export function getPerformanceReturnView(search: string, panel: string | null): 'otg' | 'gpi' | null {
  const view = new URLSearchParams(search).get('performanceReturnView');
  return view === 'otg' && panel === 'otg' ? 'otg' : view === 'gpi' && panel === 'partes' ? 'gpi' : null;
}
