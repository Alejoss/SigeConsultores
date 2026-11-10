// @vitest-environment jsdom
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProcessRiskMatrix from '../ProcessRiskMatrix';
import type { MatrizFODARow } from '@/types/matrizFODA';

// The spec also runs in the legacy unit project, which has no React plugin.
vi.stubGlobal('React', React);
const mocks = vi.hoisted(() => ({
  data: null as any,
  saveMatrix: vi.fn(),
  saveNarratives: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('wouter', () => ({
  useLocation: () => ['/process-risk-matrix', mocks.navigate],
  useSearch: () => '?processId=21',
}));
vi.mock('@/lib/sessionScope', () => ({ getCompanyIdFromSession: () => 7 }));
vi.mock('@/lib/trpc', () => ({ trpc: { processFODA: {
  get: { useQuery: () => ({ data: mocks.data }) },
  saveMatrixData: { useMutation: () => ({ mutate: mocks.saveMatrix, mutateAsync: mocks.saveMatrix }) },
  saveObjectiveNarratives: { useMutation: () => ({ mutate: mocks.saveNarratives, mutateAsync: mocks.saveNarratives }) },
} } }));
vi.mock('@/components/ProcessQuickNavigation', () => ({
  ProcessQuickNavigation: () => null,
  waitForNavigationMutations: async () => true,
}));
vi.mock('@/components/ObjectiveNarrativeFields', () => ({
  AutosavingObjectiveNarratives: () => <div>Campos narrativos existentes</div>,
}));
vi.mock('@/lib/exportRiskMatrixToPDF', () => ({ exportRiskMatrixToPDF: vi.fn() }));
vi.mock('@/lib/exportMatrizFODAToPDF', () => ({ exportMatrizFODAToPDF: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function fixture(overrides: Record<string, unknown> = {}): MatrizFODARow {
  return {
    id: 1, subproceso: 'Subproceso ficticio', objetivoPolitica: 'Política existente',
    elemento: 'Elemento FODA de revisión', foda: 'Fortaleza', factor: 'Humano',
    consecuencia: '', sistemaGestion: 'Calidad', accionATomar: 'OTG de revisión',
    planContingencia: '', planContinuidad: '', simulacro: '', comunicado: 'NO',
    partesInteresadas: 'Equipo', evidencia: 'Referencia existente', mejoraImplementada: 'NO',
    observacion: 'Observación existente', medioVerificacion: 'Informe', objetivoLogrado: 'NO',
    puntoPartida: 150, puntoLlegada: 250, alcanzado: 190, unidadMedida: 'unidades',
    // Deliberately stale: the UI must derive the current reading from source values.
    porcentajeAlcanzadoOTG: 99,
    ...overrides,
  } as MatrizFODARow;
}
function seed(row = fixture()) {
  mocks.data = {
    id: 51, matrixData: JSON.stringify([row]),
    strengths: '[]', opportunities: '[]', weaknesses: '[]', threats: '[]',
  };
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ProcessRiskMatrix /></QueryClientProvider>);
}
function expand() { fireEvent.click(screen.getByText('OTG de revisión', { selector: 'div' })); }
function result() { return within(screen.getByRole('group', { name: 'Resultado del OTG' })); }
function detailValue(label: string, value: string) {
  const group = result();
  return within(group.getByText(label).parentElement!).getByText(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem('selectedProcessId', '21');
  localStorage.setItem('selectedProcessName', 'Proceso ficticio');
  seed();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ProcessRiskMatrix: lectura numérica OTG independiente de tareas', () => {
  it('muestra resumen compacto y avance real en encabezado: 150/190/250 => +26,67% y 40%', () => {
    mount();
    const summary = result();
    expect(summary.getByText('190 unidades')).toBeTruthy();
    expect(summary.getByText('Inicio: 150 unidades · Meta: 250 unidades')).toBeTruthy();
    expect(summary.getByText('Variación respecto al inicio:')).toBeTruthy();
    expect(summary.getByText('+26,67 %')).toBeTruthy();
    expect(summary.getByText('40 %')).toBeTruthy();
    expect(screen.getByText('OTG: 40 %')).toBeTruthy();
    expect(screen.queryByText('OTG: 99%')).toBeNull();
    expect(screen.getByText('Tareas: 0%')).toBeTruthy();
    expand();
    for (const label of ['Punto de partida', 'Resultado actual', 'Meta', 'Variación respecto al inicio', 'Avance hacia la meta']) {
      expect(result().getByText(label)).toBeTruthy();
    }
    expect(detailValue('Resultado actual', '190 unidades')).toBeTruthy();
    expect(detailValue('Variación respecto al inicio', '+26,67 %')).toBeTruthy();
    expect(detailValue('Avance hacia la meta', '40 %')).toBeTruthy();
    expect(screen.getByText('Meta (punto de llegada)')).toBeTruthy();
    expect(screen.queryByText('% Alcanzado')).toBeNull();
    expect(screen.getByPlaceholderText('Valor del resultado actual').getAttribute('value')).toBe('190');
  });

  it('prioriza +5 puntos porcentuales y presenta +100% relativo como lectura secundaria', () => {
    seed(fixture({ puntoPartida: 5, alcanzado: 10, puntoLlegada: 15, unidadMedida: '%' }));
    mount();
    expect(result().getByText('+5 puntos porcentuales')).toBeTruthy();
    expect(result().getByText('Variación relativa: +100 %').className).toContain('text-xs');
    expect(screen.getByText('OTG: 50 %')).toBeTruthy();
    expand();
    expect(detailValue('Cambio respecto al inicio', '+5 puntos porcentuales')).toBeTruthy();
    expect(result().getByText('Variación relativa: +100 %').className).toContain('text-xs');
    expect(detailValue('Avance hacia la meta', '50 %')).toBeTruthy();
    expect(result().queryByText('Variación respecto al inicio')).toBeNull();
  });

  it.each([
    { current: -5, raw: '-150 %', bounded: '0', aggregate: '0%' },
    { current: 25, raw: '150 %', bounded: '100', aggregate: '100%' },
  ])('mantiene $raw sin recortar en encabezado y detalle, y el total legacy acotado', ({ current, raw, bounded, aggregate }) => {
    seed(fixture({ puntoPartida: 10, puntoLlegada: 20, alcanzado: current }));
    mount();
    expect(screen.getByText(`OTG: ${raw}`)).toBeTruthy();
    const total = screen.getByText('Avance hacia las metas OTG (normalizado)').parentElement!;
    expect(within(total).getByText(aggregate)).toBeTruthy();
    expand();
    expect(detailValue('Avance hacia la meta', raw)).toBeTruthy();
    const bar = result().getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe(bounded);
    expect(bar.getAttribute('aria-valuetext')).toContain(raw);
    expect(result().getByText(/el porcentaje no se recorta/)).toBeTruthy();
  });

  it.each([
    { baseline: 0, current: 5, goal: 10, explanation: /inicio igual a cero/i },
    { baseline: -10, current: 0, goal: 10, explanation: /inicio negativo/i },
  ])('explica la variación no calculable desde inicio $baseline sin convertir el objetivo a checklist', ({ baseline, current, goal, explanation }) => {
    seed(fixture({ puntoPartida: baseline, alcanzado: current, puntoLlegada: goal }));
    mount();
    expect(result().getByText(explanation)).toBeTruthy();
    expand();
    expect(result().getByText(explanation)).toBeTruthy();
    expect(result().getByText(/Cambio absoluto:/)).toBeTruthy();
    expect(detailValue('Avance hacia la meta', '50 %')).toBeTruthy();
    expect(result().queryByText(/No aplica al seguimiento por cumplimiento/)).toBeNull();
  });

  it.each([undefined, null, '', '   ', 'NaN', 'Infinity'])('no fabrica resultado cero con medición ausente/no finita (%s)', current => {
    seed(fixture({ alcanzado: current }));
    mount();
    expect(screen.getByText('OTG: —')).toBeTruthy();
    expand();
    expect(detailValue('Resultado actual', '—')).toBeTruthy();
    expect(detailValue('Avance hacia la meta', '—')).toBeTruthy();
    expect(result().getByText('Sin medición registrada.')).toBeTruthy();
    expect(result().queryByText('0 unidades')).toBeNull();
  });

  it('convierte valores históricos numéricos string solo para presentar', () => {
    seed(fixture({ puntoPartida: '150', alcanzado: '190', puntoLlegada: '250' }));
    const original = mocks.data.matrixData;
    mount();
    expand();
    expect(detailValue('Resultado actual', '190 unidades')).toBeTruthy();
    expect(detailValue('Avance hacia la meta', '40 %')).toBeTruthy();
    expect(mocks.data.matrixData).toBe(original);
  });

  it('mantiene tareas/checklist independientes, sus controles y todos los campos de riesgo y comunicación', () => {
    seed(fixture({
      foda: 'Debilidad', probabilidad: 'A', impacto: 1,
      acciones: [{
        id: 'task1', accion: 'Preparar informe', ponderacion: 100, responsable: 'Responsable',
        fechaImplementacion: '2026-11-09', tipoSeguimiento: 'mensual_checklist',
        checklistValues: [true, ...Array(11).fill(false)], porcentajeCompletado: 8,
      }],
    }));
    mount();
    expect(screen.getByText('Tareas: 8%')).toBeTruthy();
    expand();
    expect(screen.getByText('Meses cumplidos:').textContent).toContain('1 / 12');
    const checklist = screen.getByText('Lista de Verificación Mensual', { selector: 'label' }).parentElement!;
    expect(checklist.querySelectorAll('button')).toHaveLength(12);
    expect(screen.getByText('Tipo de Seguimiento')).toBeTruthy();
    expect(result().getByText('+26,67 %')).toBeTruthy();
    expect(result().queryByText(/puntos porcentuales/)).toBeNull();
    for (const label of [
      'Subproceso', 'Objetivo de la Política', 'Elemento (FODA)', 'FODA', 'Factor',
      'Sistema de Gestión', 'Consecuencia de la Materialización', 'Campos narrativos existentes',
      'Fecha de Planificación de la Mejora', 'Fecha Final Prevista', 'Probabilidad (A–E)',
      'Impacto (1–5)', 'Nivel de Riesgo', 'Plan de Contingencia', 'Plan de Continuidad del Negocio',
      'Simulacro', 'Comunicado', 'Partes Interesadas Comunicadas', 'Evidencia',
      'Implantada la Mejora', 'Observación', 'Medio de Verificación',
      'Implementación Cumplió su Objetivo', 'Probabilidad nueva (A–E)', 'Nuevo Nivel de Riesgo',
    ]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agregar nueva tarea' })).toBeTruthy();
    expect(screen.getByText('Avance de ejecución de tareas OTG:').textContent).toContain('8%');
    expect(screen.getAllByText('Avance de ejecución de tareas OTG')).toHaveLength(1);
    expect(screen.getByText('Completar tareas no equivale a lograr el resultado numérico del OTG.')).toBeTruthy();
  });

  it('consultar, expandir y colapsar filas no llama mutaciones ni modifica el JSON histórico', () => {
    const source = fixture({ puntoPartida: 10, puntoLlegada: 20, alcanzado: 25, porcentajeAlcanzadoOTG: 41 });
    seed(source);
    const original = mocks.data.matrixData;
    mount();
    act(() => vi.advanceTimersByTime(2500));
    expand();
    act(() => vi.advanceTimersByTime(2500));
    expand();
    act(() => vi.advanceTimersByTime(2500));
    expect(mocks.saveMatrix).not.toHaveBeenCalled();
    expect(mocks.saveNarratives).not.toHaveBeenCalled();
    expect(mocks.data.matrixData).toBe(original);
    expect(JSON.parse(original)[0]).toEqual(source);
  });

  it('el editor conserva su guardado legacy sin persistir métricas derivadas', () => {
    mount();
    expand();
    const current = screen.getByPlaceholderText('Valor del resultado actual');
    current.focus();
    fireEvent.change(current, { target: { value: '310' } });
    expect(document.activeElement).toBe(current);
    expect(detailValue('Avance hacia la meta', '160 %')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1600));
    expect(mocks.saveMatrix).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(mocks.saveMatrix.mock.calls[0][0].matrixData)[0];
    expect(saved.alcanzado).toBe(310);
    expect(saved.porcentajeAlcanzadoOTG).toBe(100);
    expect(saved.mejoraImplementada).toBe('SI');
    expect(saved).not.toHaveProperty('resultMetrics');
    expect(saved).not.toHaveProperty('porcentajeAlcanzadoOTGRaw');
    expect(saved.observacion).toBe('Observación existente');
    expect(saved.evidencia).toBe('Referencia existente');
  });

  it('el panel nuevo y encabezado tienen medidas mínimas para apilar y envolver en móvil', () => {
    const view = mount();
    expect(screen.getByText('OTG: 40 %').parentElement!.className).toContain('flex-wrap');
    expand();
    expect(view.container.querySelector('.grid-cols-1.lg\\:grid-cols-3')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Resultado del OTG' }).parentElement!.className).toContain('min-w-0');
  });
});
