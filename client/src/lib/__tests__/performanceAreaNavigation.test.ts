import { describe, expect, it } from 'vitest';
import { getPerformanceHref, getPerformanceIndicatorHref, getPerformanceReturnView, isPerformanceAreaView } from '../performanceAreaNavigation';
describe('Navegación de Desempeño por Área', () => {
  it.each(['otg','gpi','sgi','staff'] as const)('conserva la sección %s y pestaña por área', view => {
    const url = new URL(getPerformanceHref(12,view),'https://isge360.com');
    expect(url.pathname).toBe('/strategic-trends');
    expect(url.searchParams.get('companyId')).toBe('12');
    expect(url.searchParams.get('view')).toBe(view);
    expect(url.searchParams.get('tab')).toBe('areas');
  });
  it.each([['otg','otg'],['gpi','partes']] as const)('abre el indicador de %s con retorno correcto', (view,panel) => {
    const url=new URL(getPerformanceIndicatorHref(12,23,view),'https://isge360.com');
    expect(url.searchParams.get('panel')).toBe(panel);
    expect(url.searchParams.get('processId')).toBe('23');
    expect(getPerformanceReturnView(url.search,panel)).toBe(view);
  });
  it('admite un proceso en detalles SIG/Personal, no cambia el listado OTG',()=>{
    expect(getPerformanceHref(12,'sgi','areas',23)).toContain('area=23');
    expect(getPerformanceHref(12,'staff','areas',23)).toContain('area=23');
    expect(getPerformanceHref(12,'otg','areas',23)).not.toContain('area=');
  });
  it('rechaza URL externos y secciones desconocidas como retorno',()=>{
    expect(isPerformanceAreaView('https://otro.example')).toBe(false);
    expect(getPerformanceReturnView('?performanceReturnView=https://otro.example','otg')).toBeNull();
    expect(getPerformanceReturnView('?performanceReturnView=gpi','otg')).toBeNull();
    expect(()=>getPerformanceHref(0,'otg')).toThrow();
  });
});
