// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProcessRiskMatrix from './ProcessRiskMatrix';

vi.stubGlobal('React', React);

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  matrixSave: vi.fn(),
  narrativeSave: vi.fn(),
  toastError: vi.fn(),
  search: '?processId=4101&companyId=4102',
  companyId: 4102,
  foda: {} as Record<string, unknown>,
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/process-risk-matrix', mocks.navigate],
  useSearch: () => mocks.search,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock('@/lib/exportRiskMatrixToPDF', () => ({ exportRiskMatrixToPDF: vi.fn() }));
vi.mock('@/lib/exportMatrizFODAToPDF', () => ({ exportMatrizFODAToPDF: vi.fn() }));
vi.mock('@/lib/trpc', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    trpc: {
      processMap: { get: { useQuery: () => ({ data: { companyId: mocks.companyId } }) } },
      processFODA: {
        get: { useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled ? mocks.foda : undefined }) },
        saveMatrixData: { useMutation: (options: object = {}) => useMutation({ mutationFn: mocks.matrixSave, ...options }) },
        saveObjectiveNarratives: { useMutation: (options: object = {}) => useMutation({ mutationFn: mocks.narrativeSave, ...options }) },
      },
    },
  };
});

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProcessRiskMatrix /></QueryClientProvider>);
  return client;
}

async function advance(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function go(label = 'Ir a Indicadores OTG') {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await advance();
}

function expand() {
  fireEvent.click(screen.getByText('OTG sintético'));
}

function editSubprocess(value: string) {
  fireEvent.change(screen.getByDisplayValue('Subproceso sintético'), { target: { value } });
}

function savedRows(call = 0) {
  return JSON.parse(mocks.matrixSave.mock.calls[call][0].matrixData);
}

let syntheticRecordId = 4103;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/process-risk-matrix?processId=4101&companyId=4102');
  mocks.search = '?processId=4101&companyId=4102';
  mocks.companyId = 4102;
  mocks.matrixSave.mockResolvedValue({});
  mocks.narrativeSave.mockResolvedValue({});
  mocks.foda = {
    id: syntheticRecordId++,
    strengths: '[]', opportunities: '[]', weaknesses: '[]', threats: '[]',
    matrixData: JSON.stringify([{
      id: 1, subproceso: 'Subproceso sintético', accionATomar: 'OTG sintético',
      elemento: 'Elemento sintético', foda: 'Fortaleza', sistemaGestion: 'Calidad',
      objetivoPolitica: '', situacionInicial: 'Narrativa histórica',
      acciones: [{ id: 'accion-sintetica', accion: 'Tarea sintética', tipoSeguimiento: 'puntual', ponderacion: 100 }],
    }]),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ProcessRiskMatrix: navegación OTG y guardado pendiente', () => {
  it('muestra los dos accesos arriba y navega sin regrabar una matriz histórica intacta', async () => {
    setup();
    await advance(2000);
    expect(mocks.matrixSave).not.toHaveBeenCalled();
    const indicator = screen.getByRole('button', { name: 'Ir a Indicadores OTG' });
    expect(indicator.closest('div')?.parentElement?.textContent).toContain('Descargar Matriz');
    expect(screen.getByRole('button', { name: 'Ir a Cronograma Consolidado' })).toBeTruthy();
    await go();
    expect(mocks.matrixSave).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/process-indicators?processId=4101&companyId=4102&oeReturnTab=overview&panel=otg');
  });

  it('mantiene los accesos visibles pero deshabilitados sin proceso o con empresa incompatible', () => {
    mocks.search = '';
    const client = setup();
    expect((screen.getByRole('button', { name: 'Ir a Indicadores OTG' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    client.clear();
    mocks.search = '?processId=4101&companyId=4102';
    mocks.companyId = 9999;
    setup();
    expect((screen.getByRole('button', { name: 'Ir a Cronograma Consolidado' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('completa el debounce con el último borrador antes de ir a indicadores, sin duplicar el guardado', async () => {
    setup();
    expand();
    editSubprocess('Edición más reciente');
    expect(mocks.matrixSave).not.toHaveBeenCalled();
    await go();
    expect(mocks.matrixSave).toHaveBeenCalledTimes(1);
    expect(savedRows()[0].subproceso).toBe('Edición más reciente');
    expect(savedRows()[0]).not.toHaveProperty('situacionInicial');
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    await advance(2000);
    expect(mocks.matrixSave).toHaveBeenCalledTimes(1);
  });

  it('recoge el onBlur de una tarea antes de ir al cronograma', async () => {
    setup();
    expand();
    const input = screen.getByDisplayValue('Tarea sintética');
    input.focus();
    fireEvent.change(input, { target: { value: 'Tarea al salir' } });
    await go('Ir a Cronograma Consolidado');
    expect(savedRows()[0].acciones[0].accion).toBe('Tarea al salir');
    expect(mocks.navigate).toHaveBeenCalledWith('/consolidated-schedule?processId=4101&companyId=4102&oeReturnTab=overview&restore=1');
  });

  it('espera un guardado anterior y después envía la edición nueva que seguía pendiente', async () => {
    let finish!: (value: unknown) => void;
    mocks.matrixSave.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    setup();
    expand();
    editSubprocess('Borrador anterior');
    await advance(1500);
    fireEvent.change(screen.getByDisplayValue('Borrador anterior'), { target: { value: 'Último borrador' } });
    await advance(1500);
    await go();
    expect(mocks.matrixSave).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => { finish({}); });
    await advance();
    expect(mocks.matrixSave).toHaveBeenCalledTimes(2);
    expect(savedRows(1)[0].subproceso).toBe('Último borrador');
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('no duplica un guardado manual ya completado al navegar', async () => {
    setup();
    expand();
    editSubprocess('Edición manual');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await advance();
    await go();
    await advance(2000);
    expect(mocks.matrixSave).toHaveBeenCalledTimes(1);
    expect(savedRows()[0].subproceso).toBe('Edición manual');
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('bloquea la salida si el guardado que estaba activo falla durante la espera', async () => {
    let fail!: (error: Error) => void;
    mocks.matrixSave.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    setup();
    expand();
    editSubprocess('Borrador con fallo activo');
    await advance(1500);
    await go();
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => { fail(new Error('Fallo activo sintético')); });
    await advance();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.matrixSave).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('Borrador con fallo activo')).toBeTruthy();
  });

  it('incluye solo narrativas editadas en la creación normal de un OTG nuevo antes de salir', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar OTG' }));
    fireEvent.click(screen.getByText('OTG #2'));
    const input = screen.getByLabelText(/Resultado esperado/);
    input.focus();
    fireEvent.change(input, { target: { value: 'Resultado de creación sintético' } });
    await go();
    expect(mocks.matrixSave).toHaveBeenCalledTimes(1);
    expect(savedRows()[1].resultadoEsperado).toBe('Resultado de creación sintético');
    expect(savedRows()[1]).not.toHaveProperty('situacionInicial');
    expect(savedRows()[0]).not.toHaveProperty('situacionInicial');
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('bloquea un flush fallido y permite reintentar sin perder el borrador', async () => {
    mocks.matrixSave.mockRejectedValueOnce(new Error('Fallo sintético'));
    setup();
    expand();
    editSubprocess('Borrador conservado');
    await go();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(screen.getByDisplayValue('Borrador conservado')).toBeTruthy();
    await go();
    expect(mocks.matrixSave).toHaveBeenCalledTimes(2);
    expect(savedRows(1)[0].subproceso).toBe('Borrador conservado');
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('guarda narrativas mediante su endpoint específico y espera sin escribir la matriz', async () => {
    let finish!: (value: unknown) => void;
    mocks.narrativeSave.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    setup();
    expand();
    const input = screen.getByLabelText(/Situación inicial/);
    input.focus();
    fireEvent.change(input, { target: { value: 'Narrativa al salir' } });
    await go();
    expect(mocks.narrativeSave.mock.calls[0][0]).toEqual({ processId: 4101, recordId: mocks.foda.id, rowId: 1, situacionInicial: 'Narrativa al salir' });
    expect(mocks.matrixSave).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => { finish({}); });
    await advance();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('bloquea una narrativa cuyo guardado ya falló hasta que se reintenta al editar y salir del campo', async () => {
    mocks.narrativeSave.mockRejectedValueOnce(new Error('Fallo de narrativa sintético'));
    setup();
    expand();
    const input = screen.getByLabelText(/Indicador \(opcional\)/);
    fireEvent.change(input, { target: { value: 'Texto pendiente' } });
    fireEvent.blur(input);
    await advance();
    await go();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.matrixSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Texto reintentado' } });
    input.focus();
    await go();
    expect(mocks.narrativeSave).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});
