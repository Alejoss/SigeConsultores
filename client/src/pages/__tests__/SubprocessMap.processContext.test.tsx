// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SubprocessMap from '../SubprocessMap';

// Also runnable from the unit project, which has no React transform plugin.
vi.stubGlobal('React', React);
const mocks = vi.hoisted(() => ({
  session: null as any,
  contextLoading: false,
  names: {} as Record<number, any>,
  nameError: false,
  nameLoading: false,
  maps: {} as Record<number, any>,
  mapError: false,
  mapLoading: false,
  getProcess: vi.fn(),
  getMap: vi.fn(),
  upsert: vi.fn(),
  navigate: vi.fn(),
  exportPDF: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('wouter', () => ({
  useLocation: () => ['/subprocess-map', mocks.navigate],
  useSearch: () => window.location.search,
}));
vi.mock('@/contexts/ProcessLeaderAuthContext', () => ({
  useProcessLeaderAuth: () => ({ session: mocks.session, isLoading: mocks.contextLoading }),
}));
vi.mock('@/lib/trpc', () => ({ trpc: {
  processMap: { get: { useQuery: (input: { processId: number }, options: any) => {
    mocks.getProcess(input, options);
    return { data: options.enabled ? mocks.names[input.processId] : undefined, isError: mocks.nameError, isLoading: mocks.nameLoading };
  } } },
  subprocessMap: {
    get: { useQuery: (input: { processId: number }, options: any) => {
      mocks.getMap(input, options);
      return { data: options.enabled ? mocks.maps[input.processId] : undefined, isError: mocks.mapError, isLoading: mocks.mapLoading };
    } },
    upsert: { useMutation: () => ({ mutate: mocks.upsert }) },
  },
} }));
vi.mock('@/lib/exportSubprocessMapToPDF', () => ({ exportSubprocessMapToPDF: mocks.exportPDF }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

const URL_PROCESS_ID = 90006;
const OTHER_PROCESS_ID = 90007;
const COMPANY_ID = 90001;
const URL_NAME = 'Coordinación Marítima';
const STORAGE_NAME = 'Financiero Administrativo';
function route(processId: number | null = URL_PROCESS_ID, companyId: number | null = COMPANY_ID) {
  const params = new URLSearchParams();
  if (processId) params.set('processId', String(processId));
  if (companyId) params.set('companyId', String(companyId));
  window.history.replaceState({}, '', `/subprocess-map${params.size ? `?${params}` : ''}`);
}
function mapFixture(label = 'Entrada marítima ficticia') {
  return {
    entrada: JSON.stringify([{ id: 1, partesInteresadas: label, internoExterno: 'Interno', clienteProveedor: 'Cliente', necesidades: '', solicita: 'Solicitud existente', entrega: 'Entrega existente' }]),
    subprocesos: JSON.stringify([{ id: 1, acciones: 'Acción existente', subproceso: 'Subproceso existente' }]),
    salida: JSON.stringify([{ id: 1, sourceOutputKey: 'stable-output-key', salidas: 'Salida existente', entregables: 'Entregable existente', doc: 'Documento existente' }]),
  };
}
function leader(processId = URL_PROCESS_ID) {
  return { processLeaderId: 501, processId, companyId: COMPANY_ID, processName: STORAGE_NAME };
}
function title() { return screen.getByText(/^Proceso:/, { selector: 'p' }).textContent; }
function advance(milliseconds = 5000) { act(() => vi.advanceTimersByTime(milliseconds)); }
function edit(value = 'Borrador marítimo') {
  fireEvent.change(screen.getByPlaceholderText('Ingrese partes interesadas'), { target: { value } });
}
function assertEnabledQueries(processId: number) {
  const nameCalls = mocks.getProcess.mock.calls.filter(([, options]) => options.enabled);
  const mapCalls = mocks.getMap.mock.calls.filter(([, options]) => options.enabled);
  expect(nameCalls.length).toBeGreaterThan(0);
  expect(mapCalls.length).toBeGreaterThan(0);
  expect(nameCalls.every(([input]) => input.processId === processId)).toBe(true);
  expect(mapCalls.every(([input]) => input.processId === processId)).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('selectedProcessId', String(OTHER_PROCESS_ID));
  localStorage.setItem('selectedProcessName', STORAGE_NAME);
  localStorage.setItem('selectedCompanyId', '12345');
  route();
  mocks.session = null;
  mocks.contextLoading = false;
  mocks.nameError = false;
  mocks.nameLoading = false;
  mocks.mapError = false;
  mocks.mapLoading = false;
  mocks.names = {
    [URL_PROCESS_ID]: { id: URL_PROCESS_ID, companyId: COMPANY_ID, name: URL_NAME },
    [OTHER_PROCESS_ID]: { id: OTHER_PROCESS_ID, companyId: COMPANY_ID, name: 'Otro proceso ficticio' },
  };
  mocks.maps = {
    [URL_PROCESS_ID]: mapFixture(),
    [OTHER_PROCESS_ID]: mapFixture('Entrada del otro proceso'),
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SubprocessMap: contexto del proceso abierto', () => {
  it.each(['admin', 'manager'])('prioriza URL sobre almacenamiento para nombre, consulta y guardado (%s)', role => {
    if (role === 'manager') localStorage.setItem('managerCompanyId', '12345');
    const original = JSON.stringify(mocks.maps[URL_PROCESS_ID]);
    render(<SubprocessMap />);
    expect(title()).toBe(`Proceso: ${URL_NAME}`);
    expect(screen.queryByText(STORAGE_NAME, { selector: 'strong' })).toBeNull();
    assertEnabledQueries(URL_PROCESS_ID);
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.maps[URL_PROCESS_ID])).toBe(original);
    edit();
    advance(699);
    expect(mocks.upsert).not.toHaveBeenCalled();
    advance(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const payload = mocks.upsert.mock.calls[0][0];
    expect(payload.processId).toBe(URL_PROCESS_ID);
    expect(JSON.parse(payload.entrada)[0].partesInteresadas).toBe('Borrador marítimo');
    expect(JSON.parse(payload.salida)[0].sourceOutputKey).toBe('stable-output-key');
    expect(payload.necesidades).toBe('Solicita: Solicitud existente\nEntrega: Entrega existente');
  });

  it('usa el nombre autoritativo en PDF y conserva proceso/empresa al volver a Caracterización', () => {
    render(<SubprocessMap />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar a PDF' }));
    expect(mocks.exportPDF).toHaveBeenCalledWith(expect.objectContaining({
      entrada: [{ entrada: 'Solicitud existente', subproceso: 'Entrada marítima ficticia', salida: 'Entrega existente' }],
    }), URL_NAME);
    fireEvent.click(screen.getByRole('button', { name: 'VOLVER' }));
    expect(mocks.navigate).toHaveBeenCalledWith(`/process-characterization?processId=${URL_PROCESS_ID}&companyId=${COMPANY_ID}`);
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([true, false])('espera la sesión tardía del jefe y respeta URL presente=%s', hasURL => {
    route(hasURL ? URL_PROCESS_ID : null, hasURL ? COMPANY_ID : null);
    mocks.contextLoading = true;
    const view = render(<SubprocessMap />);
    expect(screen.getByText('Cargando Mapa de Subprocesos...')).toBeTruthy();
    expect(mocks.getProcess.mock.calls.every(([, options]) => !options.enabled)).toBe(true);
    expect(mocks.getMap.mock.calls.every(([, options]) => !options.enabled)).toBe(true);
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.session = leader();
    // The authenticated React session is sufficient even before its storage cache is written.
    mocks.contextLoading = false;
    view.rerender(<SubprocessMap />);
    assertEnabledQueries(URL_PROCESS_ID);
    expect(title()).toBe(`Proceso: ${URL_NAME}`);
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([true, false])('con jefe ya autenticado usa URL o sesión, nunca selectedProcessId (URL=%s)', hasURL => {
    route(hasURL ? URL_PROCESS_ID : null, hasURL ? COMPANY_ID : null);
    mocks.session = leader();
    render(<SubprocessMap />);
    assertEnabledQueries(URL_PROCESS_ID);
    expect(title()).toBe(`Proceso: ${URL_NAME}`);
  });

  it('no reemplaza la URL por otro proceso del jefe ni concede acceso al fallar las API', () => {
    mocks.session = leader(OTHER_PROCESS_ID);
    mocks.nameError = true;
    mocks.maps[URL_PROCESS_ID] = undefined;
    mocks.mapError = true;
    render(<SubprocessMap />);
    assertEnabledQueries(URL_PROCESS_ID);
    expect(title()).toBe('Proceso: Nombre no disponible');
    expect(screen.queryByDisplayValue('Entrada del otro proceso')).toBeNull();
    expect((screen.getByRole('button', { name: 'Exportar a PDF' }) as HTMLButtonElement).disabled).toBe(true);
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { response: undefined, error: false, expected: 'Cargando nombre del proceso...' },
    { response: null, error: false, expected: 'Nombre no disponible' },
    { response: { id: OTHER_PROCESS_ID, companyId: COMPANY_ID, name: STORAGE_NAME }, error: false, expected: 'Cargando nombre del proceso...' },
    { response: { id: URL_PROCESS_ID, companyId: 12345, name: STORAGE_NAME }, error: false, expected: 'Nombre no disponible' },
    { response: { id: URL_PROCESS_ID, companyId: COMPANY_ID, name: '   ' }, error: false, expected: 'Nombre no disponible' },
    { response: { id: URL_PROCESS_ID, companyId: COMPANY_ID, name: STORAGE_NAME }, error: true, expected: 'Nombre no disponible' },
  ])('rechaza nombre ausente, stale, empresa ajena o error ($expected)', ({ response, error, expected }) => {
    mocks.names[URL_PROCESS_ID] = response;
    mocks.nameError = error;
    render(<SubprocessMap />);
    expect(title()).toBe(`Proceso: ${expected}`);
    expect(screen.queryByText(STORAGE_NAME, { selector: 'strong' })).toBeNull();
    const pdfButton = screen.getByRole('button', { name: 'Exportar a PDF' });
    expect((pdfButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pdfButton);
    advance();
    expect(mocks.exportPDF).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Entrada marítima ficticia')).toBeTruthy();
  });

  it('sin ID no consulta, no exporta ni guarda y nunca usa el nombre de storage', () => {
    route(null, null);
    localStorage.removeItem('selectedProcessId');
    render(<SubprocessMap />);
    expect(title()).toBe('Proceso: Nombre no disponible');
    expect(mocks.getProcess.mock.calls.every(([, options]) => !options.enabled)).toBe(true);
    expect(mocks.getMap.mock.calls.every(([, options]) => !options.enabled)).toBe(true);
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
    edit();
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.exportPDF).not.toHaveBeenCalled();
  });

  it('un nombre tardío reemplaza sólo la espera del título y habilita el PDF sin guardar datos', () => {
    mocks.names[URL_PROCESS_ID] = undefined;
    mocks.nameLoading = true;
    const view = render(<SubprocessMap />);
    expect(title()).toBe('Proceso: Cargando nombre del proceso...');
    expect(screen.getByDisplayValue('Entrada marítima ficticia')).toBeTruthy();
    mocks.names[URL_PROCESS_ID] = { id: URL_PROCESS_ID, companyId: COMPANY_ID, name: URL_NAME };
    mocks.nameLoading = false;
    view.rerender(<SubprocessMap />);
    expect(title()).toBe(`Proceso: ${URL_NAME}`);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar a PDF' }));
    expect(mocks.exportPDF.mock.calls[0][1]).toBe(URL_NAME);
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('sin URL ni jefe conserva fallback de ID y empresa del gerente, pero no su nombre cacheado', () => {
    route(null, null);
    localStorage.setItem('managerCompanyId', String(COMPANY_ID));
    render(<SubprocessMap />);
    assertEnabledQueries(OTHER_PROCESS_ID);
    expect(title()).toBe('Proceso: Otro proceso ficticio');
    fireEvent.click(screen.getByRole('button', { name: 'VOLVER' }));
    expect(mocks.navigate).toHaveBeenCalledWith(`/process-characterization?processId=${OTHER_PROCESS_ID}&companyId=${COMPANY_ID}`);
  });

  it('un mapa inexistente se hidrata vacío sin autosave y conserva las validaciones actuales', () => {
    mocks.maps[URL_PROCESS_ID] = null;
    render(<SubprocessMap />);
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('filas vacías en Entrada'));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('un refetch no sobreescribe el borrador y el guardado manual mantiene el proceso de URL', () => {
    const view = render(<SubprocessMap />);
    edit();
    mocks.maps[URL_PROCESS_ID] = mapFixture('Respuesta remota posterior');
    view.rerender(<SubprocessMap />);
    expect(screen.getByDisplayValue('Borrador marítimo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].processId).toBe(URL_PROCESS_ID);
    advance();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it('en el mismo proceso conserva el último snapshot encolado y la recuperación tras error', () => {
    render(<SubprocessMap />);
    edit('Primer snapshot');
    advance(700);
    edit('Último snapshot');
    advance(700);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    act(() => mocks.upsert.mock.calls[0][1].onSuccess());
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    const payload = mocks.upsert.mock.calls[1][0];
    expect(payload.processId).toBe(URL_PROCESS_ID);
    expect(JSON.parse(payload.entrada)[0].partesInteresadas).toBe('Último snapshot');
    act(() => mocks.upsert.mock.calls[1][1].onError(new Error('Fallo de prueba')));
    expect(screen.getByDisplayValue('Último snapshot')).toBeTruthy();
    expect(mocks.toastError).toHaveBeenCalledWith('Fallo de prueba');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mocks.upsert.mock.calls[2][0]).toEqual(payload);
  });

  it('cambiar processId en la URL remonta el editor y cancela el draft anterior sin flush', () => {
    const view = render(<SubprocessMap />);
    edit('Borrador del área previa');
    advance(300);
    route(OTHER_PROCESS_ID);
    mocks.maps[OTHER_PROCESS_ID] = undefined;
    mocks.mapLoading = true;
    // Editor keyed by company/process; no old textarea survives even the first new-scope render.
    view.rerender(<SubprocessMap />);
    expect(screen.queryByDisplayValue('Borrador del área previa')).toBeNull();
    expect(screen.getByText('Cargando Mapa de Subprocesos...')).toBeTruthy();
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.maps[OTHER_PROCESS_ID] = mapFixture('Entrada del nuevo proceso');
    mocks.mapLoading = false;
    view.rerender(<SubprocessMap />);
    expect(title()).toBe('Proceso: Otro proceso ficticio');
    expect(screen.getByDisplayValue('Entrada del nuevo proceso')).toBeTruthy();
    expect(screen.queryByDisplayValue('Borrador del área previa')).toBeNull();
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
    edit('Borrador del nuevo proceso');
    advance(700);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].processId).toBe(OTHER_PROCESS_ID);
    expect(JSON.parse(mocks.upsert.mock.calls[0][0].entrada)[0].partesInteresadas).toBe('Borrador del nuevo proceso');
  });

  it('callbacks de guardado en vuelo del área anterior no envían su borrador encolado a otra área', () => {
    const view = render(<SubprocessMap />);
    edit('Primer borrador anterior');
    advance(700);
    const callbacks = mocks.upsert.mock.calls[0][1];
    edit('Segundo borrador anterior');
    advance(700); // Queued behind the existing in-flight mutation.
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    route(OTHER_PROCESS_ID);
    view.rerender(<SubprocessMap />);
    act(() => callbacks.onSuccess());
    act(() => callbacks.onError(new Error('Error tardío anterior')));
    advance();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].processId).toBe(URL_PROCESS_ID);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Entrada del otro proceso')).toBeTruthy();
  });

  it('cambiar companyId también aísla el borrador y rechaza el nombre del company anterior', () => {
    const view = render(<SubprocessMap />);
    edit('Borrador de la empresa anterior');
    route(URL_PROCESS_ID, 12345);
    view.rerender(<SubprocessMap />);
    expect(screen.queryByDisplayValue('Borrador de la empresa anterior')).toBeNull();
    expect(title()).toBe('Proceso: Nombre no disponible');
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('desmontar antes del debounce cancela guardado sin escribir datos al abandonar la página', () => {
    const view = render(<SubprocessMap />);
    edit();
    view.unmount();
    advance();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
