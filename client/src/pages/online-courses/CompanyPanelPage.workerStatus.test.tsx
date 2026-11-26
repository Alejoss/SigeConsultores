// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompanyPanelPage from "./CompanyPanelPage";
import { CourseWorkerStatusButton } from "./CourseWorkerStatusButton";

// Per-file jsdom supports the existing unit glob until this spec is registered in client.
// React is also available for that project's classic JSX transform of page modules.
vi.stubGlobal("React", React);

const mocks = vi.hoisted(() => ({
  actor: { role: "company_admin", name: "Administración de prueba" },
  overview: {} as any,
  retire: vi.fn(), reinstate: vi.fn(), reset: vi.fn(), override: vi.fn(),
  invalidateOverview: vi.fn(), invalidateCatalog: vi.fn(), refetch: vi.fn(),
  exportCsv: vi.fn(), writeFile: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
  analysis: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (mutateAsync = vi.fn()) => ({ useMutation: () => ({ mutateAsync, isPending: false }) });
  return { trpc: {
    useUtils: () => ({ onlineCourses: {
      companyOverview: { invalidate: mocks.invalidateOverview },
      catalogOverview: { invalidate: mocks.invalidateCatalog },
      exportCsv: { fetch: mocks.exportCsv },
    } }),
    onlineCourses: {
      whoami: { useQuery: () => ({ data: mocks.actor, isLoading: false }) },
      companyOverview: { useQuery: () => ({ data: mocks.overview, refetch: mocks.refetch }) },
      catalogOverview: { useQuery: () => ({ data: { companies: [{ id: 73, name: "Empresa de prueba" }, { id: 74, name: "Otra empresa" }] } }) },
      retireWorker: mutation(mocks.retire), reinstateWorker: mutation(mocks.reinstate),
      resetWorkerPassword: mutation(mocks.reset), setOverride: mutation(mocks.override),
      setModuleAccess: mutation(), setRegCode: mutation(), createField: mutation(),
      createModule: mutation(), createLesson: mutation(),
    },
  } };
});
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("./PortalPage", () => ({ Shell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, LoginForm: () => null }));
vi.mock("./CourseContentRemovalButton", () => ({ CourseContentRemovalButton: () => null }));
vi.mock("./ProgressAnalysisPanel", () => ({ ProgressAnalysisPanel: (props: any) => {
  mocks.analysis(props);
  return <section><h2>Análisis activo</h2><button onClick={props.onBack}>Volver al seguimiento</button></section>;
} }));
vi.mock("xlsx", () => ({
  utils: { aoa_to_sheet: vi.fn(() => ({})), book_new: vi.fn(() => ({})), book_append_sheet: vi.fn() },
  writeFile: mocks.writeFile,
}));

const lesson = { id: 21, title: "Seguridad sintética", number: 1 };
const fields = [{ id: 4, name: "Prevención", own: false, modules: [{
  id: 9, name: "Módulo de prueba", lessonCount: 1, lessons: [lesson], open: false, opensAt: null, closesAt: null,
}] }];
function worker(id: number, name: string, cedula: string, retired = false) {
  return { id, name, cedula, jobTitle: "Operador", workCenter: "Centro sintético", retiredAt: retired ? new Date("2026-11-20T12:00:00Z") : null,
    modules: { 9: { done: 1, total: 1, scoreTenths: 950, status: "aprobado", override: "auto", progressPercent: 100,
      availableNow: !retired, lessons: [{ ...lesson, status: "aprobado", scoreTenths: 950, completedAt: "2026-11-10T12:00:00Z" }] } },
  };
}
const activeOne = worker(11, "Ana María López", "0012345678");
const activeTwo = worker(12, "Ana María López Rivera", "0012345679");
const retiredOne = worker(13, "Carlos Pérez", "0000000130", true);
const retireLabel = (w = activeTwo) => `Retirar de capacitaciones: ${w.name}, cédula ${w.cedula}`;
const reinstateLabel = `Reincorporar a capacitaciones: ${retiredOne.name}, cédula ${retiredOne.cedula}`;
const status = (retired = false) => screen.getByRole("button", { name: retired ? "Personal retirado (1)" : "Personal activo (2)" });
function personnelDetails(name: string) {
  return screen.getByText(name, { selector: "b" }).closest("details")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/empresa");
  mocks.actor = { role: "company_admin", name: "Administración de prueba" };
  mocks.overview = { companyName: "Empresa de prueba", regCode: "PRUEBA-73", workerCount: 2, fields, workers: [activeOne, activeTwo], retiredWorkers: [retiredOne] };
  mocks.retire.mockResolvedValue({ outcome: "retired" });
  mocks.reinstate.mockResolvedValue({ outcome: "reinstated" });
  mocks.invalidateOverview.mockResolvedValue(undefined);
  mocks.invalidateCatalog.mockResolvedValue(undefined);
  mocks.exportCsv.mockResolvedValue({ headers: ["Nombre"], rows: [[activeOne.name], [activeTwo.name]], filename: "activos.xlsx" });
});
afterEach(cleanup);

describe("Retiro seguro del personal en el panel de capacitaciones", () => {
  it("muestra activos por defecto, cuenta activa sin sumar retirados y acciones fuera de summary", () => {
    render(<CompanyPanelPage />);
    expect(status()).toHaveAttribute("aria-pressed", "true");
    expect(status(true)).toHaveAttribute("aria-pressed", "false");
    const count = screen.getByText("Trabajadores activos").closest("article")!;
    expect(within(count).getByText("2")).toBeVisible();
    expect(screen.queryByText(retiredOne.name)).not.toBeInTheDocument();
    for (const w of [activeOne, activeTwo]) {
      const button = screen.getByRole("button", { name: retireLabel(w) });
      expect(button.closest("summary")).toBeNull();
      expect(button.closest("details")).toBeNull();
    }
  });

  it("identifica exactamente a la segunda persona sin retirar al seleccionar ni expandir el acordeón", async () => {
    render(<CompanyPanelPage />);
    const details = personnelDetails(activeTwo.name);
    fireEvent.click(screen.getByRole("button", { name: retireLabel() }));
    const dialog = screen.getByRole("alertdialog", { name: "Retirar de capacitaciones" });
    expect(within(dialog).getByText(activeTwo.name, { selector: "strong" })).toBeVisible();
    expect(within(dialog).getByText(activeTwo.cedula, { selector: "strong" })).toBeVisible();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("nómina");
    expect(dialog).toHaveTextContent("solo en esta empresa");
    expect(dialog).toHaveTextContent("certificados");
    expect(details.open).toBe(false);
    expect(mocks.retire).not.toHaveBeenCalled();
  });

  it("cancelar no llama APIs ni invalida y conserva ambos activos", async () => {
    render(<CompanyPanelPage />);
    fireEvent.click(screen.getByRole("button", { name: retireLabel() }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.retire).not.toHaveBeenCalled();
    expect(mocks.reinstate).not.toHaveBeenCalled();
    expect(mocks.invalidateOverview).not.toHaveBeenCalled();
    expect(screen.getByText(activeTwo.name)).toBeVisible();
  });

  it("confirmar envía identidad exacta y companyId del administrador e invalida overview y catálogo", async () => {
    mocks.actor.role = "platform_admin";
    window.history.replaceState(null, "", "/empresa?empresa=73");
    render(<CompanyPanelPage />);
    fireEvent.click(screen.getByRole("button", { name: retireLabel() }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.retire).toHaveBeenCalledOnce();
    expect(mocks.retire).toHaveBeenCalledWith({ workerId: 12, companyId: 73, confirmationCedula: "0012345679", confirmationName: "Ana María López Rivera" });
    expect(mocks.reinstate).not.toHaveBeenCalled();
    expect(mocks.invalidateOverview).toHaveBeenCalledOnce();
    expect(mocks.invalidateCatalog).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
  });

  it("usa la empresa de sesión sin enviar un companyId artificial", async () => {
    render(<CompanyPanelPage />);
    fireEvent.click(screen.getByRole("button", { name: retireLabel(activeOne) }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar" }));
    await waitFor(() => expect(mocks.invalidateCatalog).toHaveBeenCalledOnce());
    expect(mocks.retire).toHaveBeenCalledOnce();
    expect(mocks.retire).toHaveBeenCalledWith({ workerId: 11, confirmationCedula: "0012345678", confirmationName: "Ana María López" });
  });

  it("bloquea doble envío y cancelar mientras espera, sin ocultar prematuramente la persona", async () => {
    let resolve!: (value: unknown) => void;
    mocks.retire.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<CompanyPanelPage />);
    fireEvent.click(screen.getByRole("button", { name: retireLabel() }));
    const confirm = screen.getByRole("button", { name: "Sí, retirar" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(mocks.retire).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retirando…" })).toBeDisabled();
    expect(screen.getByText(activeTwo.name, { selector: "b" })).toBeInTheDocument();
    expect(mocks.invalidateOverview).not.toHaveBeenCalled();
    await act(async () => resolve({ outcome: "retired" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("un error mantiene dialog y persona activa sin expandir ni invalidar; muestra toast y permite reintentar", async () => {
    mocks.retire.mockRejectedValueOnce(new Error("No autorizado para esta persona"));
    render(<CompanyPanelPage />);
    const details = personnelDetails(activeTwo.name);
    fireEvent.click(screen.getByRole("button", { name: retireLabel() }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No autorizado para esta persona");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(screen.getByText(activeTwo.name, { selector: "b" })).toBeInTheDocument();
    expect(details.open).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith("No autorizado para esta persona");
    expect(mocks.invalidateOverview).not.toHaveBeenCalled();
    expect(mocks.invalidateCatalog).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.retire).toHaveBeenCalledTimes(2);
  });

  it("la acción por teclado no expande el historial y cancelar restaura foco", async () => {
    const user = userEvent.setup();
    render(<CompanyPanelPage />);
    const trigger = screen.getByRole("button", { name: retireLabel() });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(personnelDetails(activeTwo.name).open).toBe(false);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.keyboard(" ");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(personnelDetails(activeTwo.name).open).toBe(false);
  });

  it("retirados conserva historial no disponible, expandible y sin restablecer clave ni overrides", () => {
    render(<CompanyPanelPage />);
    fireEvent.click(status(true));
    expect(screen.queryByText(activeOne.name)).not.toBeInTheDocument();
    expect(screen.getByText(retiredOne.name)).toBeVisible();
    const details = personnelDetails(retiredOne.name);
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(true);
    const fieldSummary = within(details).getByText("Campo: Prevención").closest("summary")!;
    fireEvent.click(fieldSummary);
    fireEvent.click(within(details).getByText("Módulo: Módulo de prueba").closest("summary")!);
    expect(within(details).getByText("Capacitación 1: Seguridad sintética")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Restablecer clave" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Acceso individual")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exportar a Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Análisis de Avance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: reinstateLabel }).closest("summary")).toBeNull();
  });

  it("muestra la fecha de retiro ISO serializada por companyOverview", () => {
    const retiredAt = "2026-11-20T12:00:00.000Z";
    mocks.overview.retiredWorkers = [{ ...retiredOne, retiredAt }];
    render(<CompanyPanelPage />);
    fireEvent.click(status(true));
    expect(screen.getByText(`Retirado el ${new Date(retiredAt).toLocaleDateString("es-EC")}`)).toBeVisible();
  });

  it("búsquedas activa y retirada son independientes y preservan sus filtros", () => {
    render(<CompanyPanelPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar personal activo" }), { target: { value: "Rivera" } });
    expect(screen.queryByText(activeOne.name)).not.toBeInTheDocument();
    fireEvent.click(status(true));
    expect(screen.getByRole("textbox", { name: "Buscar personal retirado" })).toHaveValue("");
    expect(screen.getByText(retiredOne.name)).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar personal retirado" }), { target: { value: "sin coincidencia" } });
    expect(screen.queryByText(retiredOne.name)).not.toBeInTheDocument();
    fireEvent.click(status());
    expect(screen.getByRole("textbox", { name: "Buscar personal activo" })).toHaveValue("Rivera");
    expect(screen.getByText(activeTwo.name)).toBeVisible();
    fireEvent.click(status(true));
    expect(screen.getByRole("textbox", { name: "Buscar personal retirado" })).toHaveValue("sin coincidencia");
  });

  it("Análisis recibe exclusivamente data.workers incluso con filtro y Excel consulta solo la API activa", async () => {
    render(<CompanyPanelPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar personal activo" }), { target: { value: "Rivera" } });
    fireEvent.click(screen.getByRole("button", { name: "Análisis de Avance" }));
    expect(mocks.analysis.mock.calls.at(-1)![0].workers).toBe(mocks.overview.workers);
    expect(mocks.analysis.mock.calls.at(-1)![0].workers).not.toContain(retiredOne);
    fireEvent.click(screen.getByRole("button", { name: "Volver al seguimiento" }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    await waitFor(() => expect(mocks.writeFile).toHaveBeenCalledOnce());
    expect(mocks.exportCsv).toHaveBeenCalledOnce();
    expect(mocks.exportCsv).toHaveBeenCalledWith(undefined);
    expect(mocks.retire).not.toHaveBeenCalled();
  });

  it("reincorporación identifica a la persona, cancelar no llama API y confirmar conserva payload exacto", async () => {
    mocks.actor.role = "platform_admin";
    window.history.replaceState(null, "", "/empresa?empresa=73");
    render(<CompanyPanelPage />);
    fireEvent.click(status(true));
    fireEvent.click(screen.getByRole("button", { name: reinstateLabel }));
    const dialog = screen.getByRole("alertdialog", { name: "Reincorporar a capacitaciones" });
    expect(dialog).toHaveTextContent(retiredOne.name);
    expect(dialog).toHaveTextContent(retiredOne.cedula);
    expect(dialog).toHaveTextContent("no crea sesiones automáticas");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.reinstate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: reinstateLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, reincorporar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.reinstate).toHaveBeenCalledOnce();
    expect(mocks.reinstate).toHaveBeenCalledWith({ workerId: 13, companyId: 73, confirmationCedula: "0000000130", confirmationName: "Carlos Pérez" });
    expect(mocks.retire).not.toHaveBeenCalled();
    expect(mocks.invalidateOverview).toHaveBeenCalledOnce();
    expect(mocks.invalidateCatalog).toHaveBeenCalledOnce();
  });

  it("reincorporar también bloquea doble envío y cancelación hasta que responde la API", async () => {
    let resolve!: (value: unknown) => void;
    mocks.reinstate.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<CompanyPanelPage />);
    fireEvent.click(status(true));
    fireEvent.click(screen.getByRole("button", { name: reinstateLabel }));
    const confirm = screen.getByRole("button", { name: "Sí, reincorporar" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(mocks.reinstate).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Reincorporando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByText(retiredOne.name, { selector: "b" })).toBeInTheDocument();
    await act(async () => resolve({ ok: true }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("un error al reincorporar conserva retirado y no expande ni habilita edición", async () => {
    mocks.reinstate.mockRejectedValueOnce(new Error("Reincorporación rechazada"));
    render(<CompanyPanelPage />);
    fireEvent.click(status(true));
    fireEvent.click(screen.getByRole("button", { name: reinstateLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, reincorporar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reincorporación rechazada");
    expect(screen.getByText(retiredOne.name, { selector: "b" })).toBeInTheDocument();
    expect(personnelDetails(retiredOne.name).open).toBe(false);
    expect(mocks.invalidateOverview).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Reincorporación rechazada");
  });

  it("el listado cambia solo al recibir overview actualizado del servidor", async () => {
    const page = render(<CompanyPanelPage />);
    fireEvent.click(screen.getByRole("button", { name: retireLabel() }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar" }));
    await waitFor(() => expect(mocks.invalidateOverview).toHaveBeenCalledOnce());
    expect(screen.getByText(activeTwo.name, { selector: "b" })).toBeInTheDocument();
    mocks.overview = { ...mocks.overview, workerCount: 1, workers: [activeOne], retiredWorkers: [retiredOne, { ...activeTwo, retiredAt: new Date() }] };
    page.rerender(<CompanyPanelPage />);
    expect(screen.queryByText(activeTwo.name, { selector: "b" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personal activo (1)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Personal retirado (2)" }));
    expect(screen.getByText(activeTwo.name, { selector: "b" })).toBeVisible();
  });

  it("seleccionar otra empresa vuelve a activos y limpia ambas búsquedas", () => {
    mocks.actor.role = "platform_admin";
    window.history.replaceState(null, "", "/empresa?empresa=73");
    render(<CompanyPanelPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar personal activo" }), { target: { value: "Ana" } });
    fireEvent.click(status(true));
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar personal retirado" }), { target: { value: "Carlos" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), { target: { value: "74" } });
    expect(status()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Buscar personal activo" })).toHaveValue("");
    fireEvent.click(status(true));
    expect(screen.getByRole("textbox", { name: "Buscar personal retirado" })).toHaveValue("");
  });
});

describe("Identidad congelada del diálogo de estado", () => {
  it("envía la identidad mostrada al abrir aunque las props cambien antes de confirmar", async () => {
    const view = render(<CourseWorkerStatusButton worker={activeOne} companyId={73} />);
    fireEvent.click(screen.getByRole("button", { name: retireLabel(activeOne) }));
    view.rerender(<CourseWorkerStatusButton worker={activeTwo} companyId={74} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(activeOne.name);
    expect(dialog).toHaveTextContent(activeOne.cedula);
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar" }));
    await waitFor(() => expect(mocks.retire).toHaveBeenCalledOnce());
    expect(mocks.retire).toHaveBeenCalledWith({ workerId: 11, companyId: 73, confirmationCedula: "0012345678", confirmationName: "Ana María López" });
  });

  it("un fallo de refresco no declara fallida la mutación ya guardada ni ofrece repetirla", async () => {
    mocks.invalidateCatalog.mockRejectedValueOnce(new Error("Sin conexión"));
    render(<CourseWorkerStatusButton worker={activeOne} />);
    fireEvent.click(screen.getByRole("button", { name: retireLabel(activeOne) }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.retire).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("El estado se guardó"));
  });
});
