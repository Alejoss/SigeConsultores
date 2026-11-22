// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TolerableMarginFields } from "../TolerableMarginFields";

afterEach(cleanup);

function mount(value: React.ComponentProps<typeof TolerableMarginFields>["value"] = {}) {
  const onChange = vi.fn();
  render(<TolerableMarginFields value={value} onChange={onChange} />);
  return onChange;
}

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("TolerableMarginFields", () => {
  it("permite escribir un negativo con coma sin interrumpir el borrador y normaliza al salir", () => {
    const onChange = mount({ lowerLimit: -20, upperLimit: 20, idealValue: 0 });
    const input = field("Margen · Resultado actual");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-1," } });
    expect(input.value).toBe("-1,");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ currentValue: -1 }));

    fireEvent.change(input, { target: { value: "-1,5" } });
    expect(input.value).toBe("-1,5");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ currentValue: -1.5 }));
    fireEvent.blur(input);
    expect(input.value).toBe("-1.5");
  });

  it("envía null al borrar un campo", () => {
    const onChange = mount({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 5 });
    const input = field("Margen · Resultado actual");
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ currentValue: null }));
  });

  it("cambia a mensual sin perder el valor puntual y lo conserva al volver", () => {
    const onChange = mount({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 7 });
    const select = screen.getByLabelText("Margen · Registro de mediciones") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "mensual" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ recordingMode: "mensual", currentValue: 7 }));

    const monthlyConfig = { lowerLimit: -20, upperLimit: 20, idealValue: 0, recordingMode: "mensual" as const, currentValue: 7, monthlyValues: [10, null] };
    cleanup();
    render(<TolerableMarginFields value={monthlyConfig} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Margen · Registro de mediciones"), { target: { value: "puntual" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ recordingMode: "puntual", currentValue: 7, monthlyValues: [10, null] }));
  });

  it("actualiza una medición mensual sin perder las demás ni sus signos", () => {
    const onChange = mount({ lowerLimit: -20, upperLimit: 20, idealValue: 0, recordingMode: "mensual", monthlyValues: [25, -25, 0, null] });
    const february = field("Margen · Feb");
    fireEvent.change(february, { target: { value: "-10" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      monthlyValues: [25, -10, 0, null, null, null, null, null, null, null, null, null],
    }));
  });

  it("deshabilita todos los controles cuando disabled es true", () => {
    mount({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 5 });
    cleanup();
    render(<TolerableMarginFields value={{ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 5 }} onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText("Margen · Límite inferior")).toBeDisabled();
    expect(screen.getByLabelText("Margen · Límite superior")).toBeDisabled();
    expect(screen.getByLabelText("Margen · Valor ideal (opcional)")).toBeDisabled();
    expect(screen.getByLabelText("Margen · Registro de mediciones")).toBeDisabled();
    expect(screen.getByLabelText("Margen · Resultado actual")).toBeDisabled();
  });
});
