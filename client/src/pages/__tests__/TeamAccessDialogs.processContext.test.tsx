// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamAccessDialog } from "@/components/TeamAccessDialogs";
import { defaultModuleAccess } from "@/lib/teamAccess";
const processes = [{ id: 11, name: "Proceso propio" }, { id: 12, name: "Finanzas" }, { id: 13, name: "Operaciones" }];
const leader = { accountId: 21, processId: 11, leaderName: "Jefe de prueba", moduleAccess: defaultModuleAccess(), processAccess: [] };
afterEach(cleanup);
describe("explicit granular access dialogs", () => {
  it("opens without a silent write, excludes own process and defaults extras to Solo consulta", () => {
    const apply = vi.fn(); const close = vi.fn();
    render(<TeamAccessDialog mode="assign" leader={leader} processes={processes} pending={false} onApply={apply} onClose={close} />);
    expect(apply).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Aplicar cambios" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Acceso a otros procesos" }));
    expect(screen.queryByRole("checkbox", { name: "Proceso propio" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Finanzas" }));
    expect((screen.getByLabelText("Nivel de acceso a Finanzas") as HTMLSelectElement).value).toBe("read");
    expect(apply).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Resumen de confirmación" })).getByText(/Finanzas · Solo consulta/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    expect(apply).toHaveBeenCalledWith({ moduleChanges: [], processAccess: [{ processId: 12, accessLevel: "read" }] });
  });
  it("requires an explicit selection for process write and can select multiple grants", () => {
    const apply = vi.fn();
    render(<TeamAccessDialog mode="assign" leader={leader} processes={processes} pending={false} onApply={apply} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Acceso a otros procesos" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Finanzas" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Operaciones" }));
    fireEvent.change(screen.getByLabelText("Nivel de acceso a Finanzas"), { target: { value: "write" } });
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    expect(apply).toHaveBeenCalledWith({ moduleChanges: [], processAccess: [{ processId: 12, accessLevel: "write" }, { processId: 13, accessLevel: "read" }] });
  });
  it("assigns only changed strategy/systems keys, preserving nested deny and legacy grants", () => {
    const apply = vi.fn(); const modules = { ...defaultModuleAccess(true), company_foda: "none" as const, strategy: "read" as const };
    render(<TeamAccessDialog mode="assign" leader={{ ...leader, moduleAccess: modules }} processes={processes} pending={false} onApply={apply} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Estrategia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    expect(apply).toHaveBeenCalledWith({ moduleChanges: [{ module: "strategy", accessLevel: "write" }] });
    expect(screen.getByText(/FODA empresarial:/).textContent).toContain("Restringido");
  });
  it("shows current restrictions and unchecks to read, never implicit write; restrictions support multiselect", () => {
    const apply = vi.fn(); const modules = { ...defaultModuleAccess(true), company_foda: "none" as const };
    render(<TeamAccessDialog mode="restrict" leader={{ ...leader, moduleAccess: modules }} processes={processes} pending={false} onApply={apply} onClose={vi.fn()} />);
    expect((screen.getByRole("checkbox", { name: "FODA empresarial" }) as HTMLInputElement).checked).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "FODA empresarial" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Gestión del cambio" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Organización y Personal" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    expect(apply).toHaveBeenCalledWith({ moduleChanges: [{ module: "change_management", accessLevel: "none" }, { module: "company_foda", accessLevel: "read" }, { module: "organization_personnel", accessLevel: "none" }] });
  });
  it("cancel discards edited checkboxes without sending any permissions", () => {
    const apply = vi.fn(); const close = vi.fn();
    render(<TeamAccessDialog mode="restrict" leader={leader} processes={processes} pending={false} onApply={apply} onClose={close} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Sistemas de Gestión" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(close).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
  });
});
