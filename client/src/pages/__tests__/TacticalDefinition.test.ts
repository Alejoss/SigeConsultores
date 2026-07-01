import { describe, it, expect } from "vitest";
import { parseStrategicObjectiveDescription } from "@/lib/parseStrategicObjective";

describe("TacticalDefinition — parseStrategicObjectiveDescription", () => {
  it("should display plain text description as-is", () => {
    expect(parseStrategicObjectiveDescription("Incremento de la rentabilidad")).toBe(
      "Incremento de la rentabilidad"
    );
  });

  it("should parse JSON with description field", () => {
    const json = JSON.stringify({
      category: "",
      goal: 100,
      resultKeys: ["Key1", "Key2"],
      description: "Incremento de la rentabilidad",
    });
    expect(parseStrategicObjectiveDescription(json)).toBe("Incremento de la rentabilidad");
  });

  it("should prefer description over name when both are present", () => {
    const json = JSON.stringify({
      id: 123,
      name: "Incremento de la rentabilidad",
      description: "Descripción prioritaria",
    });
    expect(parseStrategicObjectiveDescription(json)).toBe("Descripción prioritaria");
  });

  it("should parse JSON with only name field", () => {
    const json = JSON.stringify({
      id: 123,
      name: "Incremento de la rentabilidad",
    });
    expect(parseStrategicObjectiveDescription(json)).toBe("Incremento de la rentabilidad");
  });
});
