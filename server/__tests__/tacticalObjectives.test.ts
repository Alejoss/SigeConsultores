import { describe, it, expect } from "vitest";

describe("Tactical Objectives Calculation", () => {
  it("should calculate 0% when no objectives are completed", () => {
    const objectives = [
      { id: 1, completed: "NO" },
      { id: 2, completed: "NO" },
      { id: 3, completed: "NO" },
    ];
    
    const completed = objectives.filter(o => o.completed === "SI").length;
    const percentage = objectives.length > 0 ? Math.round((completed / objectives.length) * 100) : 0;
    
    expect(percentage).toBe(0);
  });

  it("should calculate 50% when half objectives are completed", () => {
    const objectives = [
      { id: 1, completed: "SI" },
      { id: 2, completed: "NO" },
    ];
    
    const completed = objectives.filter(o => o.completed === "SI").length;
    const percentage = objectives.length > 0 ? Math.round((completed / objectives.length) * 100) : 0;
    
    expect(percentage).toBe(50);
  });

  it("should calculate 100% when all objectives are completed", () => {
    const objectives = [
      { id: 1, completed: "SI" },
      { id: 2, completed: "SI" },
      { id: 3, completed: "SI" },
    ];
    
    const completed = objectives.filter(o => o.completed === "SI").length;
    const percentage = objectives.length > 0 ? Math.round((completed / objectives.length) * 100) : 0;
    
    expect(percentage).toBe(100);
  });

  it("should calculate 33% when one of three objectives is completed", () => {
    const objectives = [
      { id: 1, completed: "SI" },
      { id: 2, completed: "NO" },
      { id: 3, completed: "NO" },
    ];
    
    const completed = objectives.filter(o => o.completed === "SI").length;
    const percentage = objectives.length > 0 ? Math.round((completed / objectives.length) * 100) : 0;
    
    expect(percentage).toBe(33);
  });
});
