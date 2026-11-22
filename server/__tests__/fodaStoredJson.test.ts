import { describe, expect, it } from "vitest";
import { parseStoredFodaArray } from "../../shared/fodaStoredJson";

const row = { id: 7, fodaElementId: "fixture-history", statement: "Hallazgo ficticio", selectedObjectiveContent: "Objetivo\n\nDescripción", unknown: { nested: [0, null, "á😀"] } };
const legacy = (rows: unknown[]) => JSON.stringify(rows).replace(/\\n/g, "\n");

describe("lector de categorías FODA almacenadas", () => {
  it.each([null, undefined, "", "[]"])("mantiene el vacío histórico permitido (%s)", value => {
    expect(parseStoredFodaArray(value)).toEqual([]);
  });
  it("conserva JSON válido, identidades, Unicode, propiedades desconocidas y escapes", () => {
    const source = [{ ...row, text: 'comillas "texto"; ruta C:\\carpeta; secuencia literal \\n; tab\t y CR\r' }];
    const serialized = JSON.stringify(source);
    expect(parseStoredFodaArray(serialized)).toEqual(source);
    expect(serialized).toBe(JSON.stringify(source));
  });
  it("lee las cuatro categorías del formato antiguo de 13 objetos sin descartar filas ni cambiar saltos", () => {
    const groups = [4, 3, 2, 4].map(count => Array.from({ length: count }, (_, index) => ({ ...row, id: index + 1 })));
    for (const rows of groups) {
      const serialized = legacy(rows);
      expect(() => JSON.parse(serialized)).toThrow();
      expect(parseStoredFodaArray(serialized)).toEqual(rows);
      expect(serialized).toBe(legacy(rows));
    }
  });
  it("recupera cada control C0 literal solo dentro de cadenas manteniendo su carácter", () => {
    for (let code = 0; code < 32; code++) {
      const character = String.fromCharCode(code);
      const serialized = '[{"id":1,"text":"antes' + character + 'después"}]';
      expect(parseStoredFodaArray(serialized)).toEqual([{ id: 1, text: "antes" + character + "después" }]);
    }
  });
  it("respeta comillas escapadas, barras pares y texto parecido a JSON", () => {
    const rows = [{ ...row, text: 'Una "cita"\nC:\\ruta\\\n{\"contenido\":true}' }];
    expect(parseStoredFodaArray(legacy(rows))).toEqual(rows);
  });
  it("conserva saltos de formato fuera de cadenas sin recuperaciones globales", () => {
    const serialized = '[\n {"text":"A\nB"}\n]';
    expect(parseStoredFodaArray(serialized)).toEqual([{ text: "A\nB" }]);
  });
  it.each(["null", "{}", '"[]"', "1", "true", '[null]', '[1]', '["fila"]', '[[]]', '[{}, null]', '[{}, true]'])
    ("rechaza raíces o filas incompatibles sin convertirlas a vacío: %s", serialized => {
      expect(() => parseStoredFodaArray(serialized)).toThrow();
    });
  it.each([
    '[{"text":"A\nB"}',
    '[{"text":"A\nB",}]',
    '[{"text":"A\nB","x":undefined}]',
    '[{"text":"A\nB","x":"\\q"}]',
    '[{"text":"A\nB","x":"\\u12"}]',
    '[{"text":"A\\\nB"}]',
    '[{"text":"A\nB"}] trailing',
    '[{"text":"A\nB","other":"sin cierre}]',
    '[\u0001{"text":"A\nB"}]',
  ])("no disimula otros errores ni escapes inválidos (%s)", serialized => {
    expect(() => parseStoredFodaArray(serialized)).toThrow();
  });
});
