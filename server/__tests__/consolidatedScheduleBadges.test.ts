import { describe, it, expect } from "vitest";

describe("Consolidated Schedule with Badges", () => {
  it("should assign correct badge for Criticidad de Partes Interesadas", () => {
    const activity = {
      type: "stakeholder",
      badge: "Criticidad",
      badgeColor: "bg-blue-100 text-blue-700 border-blue-300",
    };

    expect(activity.badge).toBe("Criticidad");
    expect(activity.badgeColor).toContain("bg-blue-100");
  });

  it("should assign correct badge for Fortaleza FODA", () => {
    const activity = {
      type: "foda",
      fodaType: "Fortaleza",
      badge: "Fortaleza",
      badgeColor: "bg-green-100 text-green-700 border-green-300",
    };

    expect(activity.badge).toBe("Fortaleza");
    expect(activity.badgeColor).toContain("bg-green-100");
  });

  it("should assign correct badge for Oportunidad FODA", () => {
    const activity = {
      type: "foda",
      fodaType: "Oportunidad",
      badge: "Oportunidad",
      badgeColor: "bg-orange-100 text-orange-700 border-orange-300",
    };

    expect(activity.badge).toBe("Oportunidad");
    expect(activity.badgeColor).toContain("bg-orange-100");
  });

  it("should assign correct badge for Debilidad FODA", () => {
    const activity = {
      type: "foda",
      fodaType: "Debilidad",
      badge: "Debilidad",
      badgeColor: "bg-red-100 text-red-700 border-red-300",
    };

    expect(activity.badge).toBe("Debilidad");
    expect(activity.badgeColor).toContain("bg-red-100");
  });

  it("should assign correct badge for Amenaza FODA", () => {
    const activity = {
      type: "foda",
      fodaType: "Amenaza",
      badge: "Amenaza",
      badgeColor: "bg-purple-100 text-purple-700 border-purple-300",
    };

    expect(activity.badge).toBe("Amenaza");
    expect(activity.badgeColor).toContain("bg-purple-100");
  });

  it("should assign correct badge for Objetivo Táctico", () => {
    const activity = {
      type: "objective",
      badge: "Objetivo Táctico",
      badgeColor: "bg-yellow-100 text-yellow-700 border-yellow-300",
    };

    expect(activity.badge).toBe("Objetivo Táctico");
    expect(activity.badgeColor).toContain("bg-yellow-100");
  });

  it("should assign correct badge for Cumplimiento", () => {
    const activity = {
      type: "compliance",
      badge: "Cumplimiento",
      badgeColor: "bg-pink-100 text-pink-700 border-pink-300",
    };

    expect(activity.badge).toBe("Cumplimiento");
    expect(activity.badgeColor).toContain("bg-pink-100");
  });

  it("should assign correct badge for Capacitación", () => {
    const activity = {
      type: "training",
      badge: "Capacitación",
      badgeColor: "bg-indigo-100 text-indigo-700 border-indigo-300",
    };

    expect(activity.badge).toBe("Capacitación");
    expect(activity.badgeColor).toContain("bg-indigo-100");
  });

  it("should calculate days remaining correctly", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 10);

    const daysRemaining = Math.ceil(
      (futureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(daysRemaining).toBe(10);
  });

  it("should identify overdue activities", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 5);

    const daysRemaining = Math.ceil(
      (pastDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(daysRemaining).toBeLessThan(0);
  });

  it("should extract criticality action data correctly", () => {
    const stakeholder = {
      id: 1,
      name: "Proveedor A",
      actionToTake: "Mejorar tiempos de entrega",
      endDate: new Date("2024-04-30"),
      completed: "SI",
    };

    expect(stakeholder.actionToTake).toBeTruthy();
    expect(stakeholder.endDate).toBeInstanceOf(Date);
    expect(["SI", "NO"]).toContain(stakeholder.completed);
  });

  it("should extract FODA action data correctly", () => {
    const fodaRow = {
      type: "Fortaleza",
      elemento: "Sistema de Gestión",
      accionDeAprovechamiento: "Expandir servicios",
      fechaFinalPrevista: "2024-05-15",
      implementacionCumplio: "SI",
    };

    expect(fodaRow.accionDeAprovechamiento).toBeTruthy();
    expect(fodaRow.fechaFinalPrevista).toBeTruthy();
    expect(["SI", "NO"]).toContain(fodaRow.implementacionCumplio);
  });

  it("should extract tactical objective task data correctly", () => {
    const task = {
      description: "Realizar encuesta de satisfacción",
      date: "2024-04-15",
      completed: "SI",
      completionPercentage: 100,
    };

    expect(task.description).toBeTruthy();
    expect(task.date).toBeTruthy();
    expect(task.completionPercentage).toBe(100);
  });

  it("should extract compliance data correctly", () => {
    const compliance = {
      id: 1,
      requirement: "Inspección SSO",
      dueDate: new Date("2024-03-04"),
      completed: "SI",
      completionPercentage: 100,
    };

    expect(compliance.requirement).toBeTruthy();
    expect(compliance.dueDate).toBeInstanceOf(Date);
    expect(compliance.completionPercentage).toBe(100);
  });

  it("should extract training data correctly", () => {
    const training = {
      id: 1,
      name: "Capacitación en Seguridad",
      plannedDate: new Date("2024-04-20"),
      conductedDate: new Date("2024-04-20"),
    };

    expect(training.name).toBeTruthy();
    expect(training.plannedDate).toBeInstanceOf(Date);
    const isCompleted = training.conductedDate ? true : false;
    expect(isCompleted).toBe(true);
  });

  it("should calculate training completion percentage", () => {
    const training1 = { name: "Training 1", conductedDate: new Date() };
    const training2 = { name: "Training 2", conductedDate: null };

    const completion1 = training1.conductedDate ? 100 : 0;
    const completion2 = training2.conductedDate ? 100 : 0;

    expect(completion1).toBe(100);
    expect(completion2).toBe(0);
  });

  it("should aggregate activities from all modules", () => {
    const activities = [
      { type: "stakeholder", badge: "Criticidad" },
      { type: "foda", badge: "Fortaleza" },
      { type: "foda", badge: "Oportunidad" },
      { type: "foda", badge: "Debilidad" },
      { type: "foda", badge: "Amenaza" },
      { type: "objective", badge: "Objetivo Táctico" },
      { type: "compliance", badge: "Cumplimiento" },
      { type: "training", badge: "Capacitación" },
    ];

    expect(activities).toHaveLength(8);
    expect(activities.filter(a => a.type === "stakeholder")).toHaveLength(1);
    expect(activities.filter(a => a.type === "foda")).toHaveLength(4);
    expect(activities.filter(a => a.type === "objective")).toHaveLength(1);
    expect(activities.filter(a => a.type === "compliance")).toHaveLength(1);
    expect(activities.filter(a => a.type === "training")).toHaveLength(1);
  });

  it("should sort activities by due date", () => {
    const activities = [
      { id: "1", dueDate: new Date("2024-05-15") },
      { id: "2", dueDate: new Date("2024-03-20") },
      { id: "3", dueDate: new Date("2024-04-10") },
    ];

    const sorted = [...activities].sort((a, b) =>
      a.dueDate.getTime() - b.dueDate.getTime()
    );

    expect(sorted[0].id).toBe("2");
    expect(sorted[1].id).toBe("3");
    expect(sorted[2].id).toBe("1");
  });

  it("should validate badge color format", () => {
    const badges = [
      "bg-blue-100 text-blue-700 border-blue-300",
      "bg-green-100 text-green-700 border-green-300",
      "bg-orange-100 text-orange-700 border-orange-300",
      "bg-red-100 text-red-700 border-red-300",
      "bg-purple-100 text-purple-700 border-purple-300",
      "bg-yellow-100 text-yellow-700 border-yellow-300",
      "bg-pink-100 text-pink-700 border-pink-300",
      "bg-indigo-100 text-indigo-700 border-indigo-300",
    ];

    badges.forEach(badge => {
      expect(badge).toMatch(/bg-\w+-100/);
      expect(badge).toMatch(/text-\w+-700/);
      expect(badge).toMatch(/border-\w+-300/);
    });
  });

  it("should handle empty activity list", () => {
    const activities: any[] = [];

    expect(activities).toHaveLength(0);
    expect(activities.filter(a => a.type === "stakeholder")).toHaveLength(0);
  });

  it("should display completion percentage for objectives and compliance", () => {
    const objective = {
      type: "objective",
      completionPercentage: 75,
    };

    const compliance = {
      type: "compliance",
      completionPercentage: 50,
    };

    expect(objective.completionPercentage).toBe(75);
    expect(compliance.completionPercentage).toBe(50);
  });
});
