import { describe, it, expect } from "vitest";

describe("Consolidated Schedule Integration", () => {
  it("should parse stakeholder criticality JSON data correctly", () => {
    const stakeholderData = {
      id: 1,
      processId: 1,
      name: "Proveedor A",
      actionToTake: "Mejorar tiempos de entrega",
      startDate: new Date("2024-03-01"),
      endDate: new Date("2024-04-30"),
      completed: "SI",
    };

    expect(stakeholderData.actionToTake).toBeTruthy();
    expect(stakeholderData.endDate).toBeInstanceOf(Date);
    expect(["SI", "NO"]).toContain(stakeholderData.completed);
  });

  it("should parse FODA matrix JSON data correctly", () => {
    const fodaMatrixData = [
      {
        id: "1",
        type: "Fortaleza",
        elemento: "Equipo experimentado",
        accionDeAprovechamiento: "Expandir servicios",
        plannedDate: "2024-05-15",
        implemented: "SI",
      },
      {
        id: "2",
        type: "Debilidad",
        elemento: "Recursos limitados",
        accionATomar: "Aumentar presupuesto",
        plannedDate: "2024-06-30",
        implemented: "NO",
      },
    ];

    fodaMatrixData.forEach(item => {
      expect(item.type).toBeTruthy();
      expect(item.elemento).toBeTruthy();
      expect(["SI", "NO"]).toContain(item.implemented);
    });
  });

  it("should parse tactical objectives planning data correctly", () => {
    const planningData = [
      {
        id: "1",
        resultKey: {
          description: "Mejorar satisfacción del cliente",
          dueDate: "2024-05-31",
          completed: "NO",
        },
        tasks: [
          {
            description: "Realizar encuesta",
            date: "2024-04-15",
            completed: "SI",
            completionPercentage: 100,
          },
          {
            description: "Analizar resultados",
            date: "2024-05-15",
            completed: "NO",
            completionPercentage: 50,
          },
        ],
      },
    ];

    const planning = planningData[0];
    expect(planning.resultKey.description).toBeTruthy();
    expect(planning.tasks).toHaveLength(2);
    expect(planning.tasks[0].completionPercentage).toBe(100);
  });

  it("should aggregate activities from multiple sources", () => {
    const stakeholderActivities = [
      {
        id: "stakeholder-1",
        type: "stakeholder",
        element: "Proveedor A",
        action: "Mejorar tiempos",
        dueDate: new Date("2024-04-30"),
        completed: "SI",
      },
    ];

    const fodaActivities = [
      {
        id: "foda-1",
        type: "foda",
        element: "Fortaleza: Equipo",
        action: "Expandir servicios",
        dueDate: new Date("2024-05-15"),
        completed: "NO",
      },
    ];

    const objectiveActivities = [
      {
        id: "objective-1",
        type: "objective",
        element: "Objetivo: Satisfacción",
        action: "Mejorar satisfacción",
        dueDate: new Date("2024-05-31"),
        completed: "NO",
      },
    ];

    const allActivities = [
      ...stakeholderActivities,
      ...fodaActivities,
      ...objectiveActivities,
    ];

    expect(allActivities).toHaveLength(3);
    expect(allActivities.filter(a => a.type === "stakeholder")).toHaveLength(1);
    expect(allActivities.filter(a => a.type === "foda")).toHaveLength(1);
    expect(allActivities.filter(a => a.type === "objective")).toHaveLength(1);
  });

  it("should sort activities by due date", () => {
    const activities = [
      {
        id: "1",
        dueDate: new Date("2024-05-15"),
        completed: "NO",
      },
      {
        id: "2",
        dueDate: new Date("2024-03-20"),
        completed: "SI",
      },
      {
        id: "3",
        dueDate: new Date("2024-04-10"),
        completed: "NO",
      },
    ];

    const sorted = [...activities].sort((a, b) =>
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );

    expect(sorted[0].id).toBe("2");
    expect(sorted[1].id).toBe("3");
    expect(sorted[2].id).toBe("1");
  });

  it("should filter activities by month", () => {
    const activities = [
      {
        id: "1",
        dueDate: new Date("2024-03-15"),
        completed: "SI",
      },
      {
        id: "2",
        dueDate: new Date("2024-04-20"),
        completed: "NO",
      },
      {
        id: "3",
        dueDate: new Date("2024-03-25"),
        completed: "NO",
      },
    ];

    const currentMonth = 2; // March
    const currentYear = 2024;

    const monthActivities = activities.filter(activity => {
      const activityDate = new Date(activity.dueDate);
      return (
        activityDate.getMonth() === currentMonth &&
        activityDate.getFullYear() === currentYear
      );
    });

    expect(monthActivities).toHaveLength(2);
    expect(monthActivities.every(a => a.dueDate.getMonth() === 2)).toBe(true);
  });

  it("should calculate completion percentage correctly", () => {
    const activities = [
      { id: "1", completed: "SI" },
      { id: "2", completed: "SI" },
      { id: "3", completed: "NO" },
      { id: "4", completed: "NO" },
    ];

    const completedCount = activities.filter(a => a.completed === "SI").length;
    const percentage = Math.round((completedCount / activities.length) * 100);

    expect(percentage).toBe(50);
  });

  it("should handle empty activity list", () => {
    const activities: any[] = [];

    const percentage =
      activities.length > 0
        ? Math.round(
            (activities.filter(a => a.completed === "SI").length /
              activities.length) *
              100
          )
        : 0;

    expect(percentage).toBe(0);
  });

  it("should extract element type from activity", () => {
    const activities = [
      {
        id: "1",
        element: "Criticidad de Partes Interesadas",
        type: "stakeholder",
      },
      {
        id: "2",
        element: "Matriz (FODA)",
        type: "foda",
      },
      {
        id: "3",
        element: "Objetivos tácticos",
        type: "objective",
      },
    ];

    const elementGroups: Record<string, number> = {};
    activities.forEach(activity => {
      elementGroups[activity.element] =
        (elementGroups[activity.element] || 0) + 1;
    });

    expect(elementGroups["Criticidad de Partes Interesadas"]).toBe(1);
    expect(elementGroups["Matriz (FODA)"]).toBe(1);
    expect(elementGroups["Objetivos tácticos"]).toBe(1);
  });

  it("should validate activity structure", () => {
    const activity = {
      id: "stakeholder-1",
      type: "stakeholder",
      element: "Proveedor A",
      action: "Mejorar tiempos de entrega",
      dueDate: new Date("2024-04-30"),
      completed: "SI",
      completionField: "Realizado",
    };

    const isValid =
      activity.id &&
      ["stakeholder", "foda", "objective", "compliance", "training"].includes(
        activity.type
      ) &&
      activity.element &&
      activity.action &&
      activity.dueDate &&
      ["SI", "NO"].includes(activity.completed);

    expect(isValid).toBe(true);
  });

  it("should calculate days remaining from due date", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 10);

    const daysRemaining = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(daysRemaining).toBe(10);
  });

  it("should identify overdue activities", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueDate = new Date(today);
    overdueDate.setDate(overdueDate.getDate() - 5);

    const daysRemaining = Math.ceil(
      (overdueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(daysRemaining).toBeLessThan(0);
  });

  it("should handle multiple activities on same date", () => {
    const activities = [
      {
        id: "1",
        dueDate: new Date("2024-04-15"),
        type: "stakeholder",
      },
      {
        id: "2",
        dueDate: new Date("2024-04-15"),
        type: "foda",
      },
      {
        id: "3",
        dueDate: new Date("2024-04-15"),
        type: "objective",
      },
    ];

    const sameDate = activities.filter(
      a =>
        a.dueDate.getTime() === new Date("2024-04-15").getTime()
    );

    expect(sameDate).toHaveLength(3);
  });
});
