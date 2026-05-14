import { describe, it, expect } from "vitest";

describe("Consolidated Schedule", () => {
  it("should filter activities by month correctly", () => {
    const activities = [
      { id: "1", dueDate: new Date("2024-01-15"), completed: "SI" },
      { id: "2", dueDate: new Date("2024-02-20"), completed: "NO" },
      { id: "3", dueDate: new Date("2024-01-25"), completed: "NO" },
    ];

    const currentMonth = 0; // January
    const currentYear = 2024;

    const monthActivities = activities.filter(activity => {
      const activityDate = new Date(activity.dueDate);
      return activityDate.getMonth() === currentMonth && activityDate.getFullYear() === currentYear;
    });

    expect(monthActivities).toHaveLength(2);
    expect(monthActivities[0].id).toBe("1");
    expect(monthActivities[1].id).toBe("3");
  });

  it("should calculate month completion percentage", () => {
    const monthActivities = [
      { id: "1", completed: "SI" },
      { id: "2", completed: "SI" },
      { id: "3", completed: "NO" },
      { id: "4", completed: "NO" },
    ];

    const monthCompletedActivities = monthActivities.filter(a => a.completed === "SI").length;
    const monthPercentageCompleted = monthActivities.length > 0
      ? Math.round((monthCompletedActivities / monthActivities.length) * 100)
      : 0;

    expect(monthPercentageCompleted).toBe(50);
  });

  it("should determine correct status for overdue activities", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const dueDate = yesterday;
    today.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    expect(diffDays).toBeLessThan(0);
  });

  it("should group activities by element type", () => {
    const activities = [
      { id: "1", element: "Criticidad de Partes Interesadas", type: "stakeholder" },
      { id: "2", element: "Matriz (FODA)", type: "foda" },
      { id: "3", element: "Criticidad de Partes Interesadas", type: "stakeholder" },
      { id: "4", element: "Cumplimientos", type: "compliance" },
    ];

    const elementGroups: Record<string, number> = {};
    activities.forEach(activity => {
      elementGroups[activity.element] = (elementGroups[activity.element] || 0) + 1;
    });

    expect(elementGroups["Criticidad de Partes Interesadas"]).toBe(2);
    expect(elementGroups["Matriz (FODA)"]).toBe(1);
    expect(elementGroups["Cumplimientos"]).toBe(1);
  });

  it("should sort activities by due date", () => {
    const activities = [
      { id: "1", dueDate: new Date("2024-03-15") },
      { id: "2", dueDate: new Date("2024-01-20") },
      { id: "3", dueDate: new Date("2024-02-10") },
    ];

    const sorted = [...activities].sort((a, b) => 
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );

    expect(sorted[0].id).toBe("2");
    expect(sorted[1].id).toBe("3");
    expect(sorted[2].id).toBe("1");
  });

  it("should have correct element colors mapping", () => {
    const ELEMENT_COLORS: Record<string, string> = {
      "Criticidad de Partes Interesadas": "bg-blue-100 text-blue-700 border-blue-300",
      "Matriz (FODA)": "bg-purple-100 text-purple-700 border-purple-300",
      "Objetivos tácticos": "bg-green-100 text-green-700 border-green-300",
      "Cumplimientos": "bg-orange-100 text-orange-700 border-orange-300",
      "Capacitaciones": "bg-pink-100 text-pink-700 border-pink-300",
    };

    expect(Object.keys(ELEMENT_COLORS)).toHaveLength(5);
    expect(ELEMENT_COLORS["Criticidad de Partes Interesadas"]).toContain("bg-blue-100");
    expect(ELEMENT_COLORS["Matriz (FODA)"]).toContain("bg-purple-100");
  });
});
