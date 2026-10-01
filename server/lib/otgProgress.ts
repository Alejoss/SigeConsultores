type UnknownRecord = Record<string, unknown>;

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercentage(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function calcRangePercentage(start: number, target: number, current: number): number | null {
  if (target === start) return null;
  return clampPercentage(((current - start) / (target - start)) * 100);
}

function currentActionPercentage(action: UnknownRecord): number | null {
  const trackingType = String(action.tipoSeguimiento || "puntual");

  if (trackingType === "mensual_checklist") {
    const values = Array.isArray(action.checklistValues) ? action.checklistValues : [];
    if (values.length > 0) return clampPercentage((values.filter(Boolean).length / 12) * 100);
  }

  if (trackingType === "mensual_sumatoria" || trackingType === "mensual_promedio") {
    const values = Array.isArray(action.monthlyValues)
      ? action.monthlyValues.map(asNumber).filter((value): value is number => value !== null)
      : [];
    if (values.length > 0) {
      const current = trackingType === "mensual_sumatoria"
        ? values.reduce((sum, value) => sum + value, 0)
        : (() => {
            const nonZero = values.filter(value => value !== 0);
            return nonZero.length > 0
              ? nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length
              : 0;
          })();
      const start = asNumber(action.puntoPartidaAccion) ?? asNumber(action.puntoPartida) ?? 0;
      const target = asNumber(action.puntoLlegadaAccion) ?? asNumber(action.puntoLlegada);
      if (target !== null) return calcRangePercentage(start, target, current);
    }
  }

  if (trackingType === "puntual") {
    const current = asNumber(action.valorPuntual) ?? asNumber(action.alcanzado);
    const currentTarget = asNumber(action.puntoLlegadaAccion);
    if (current !== null && currentTarget !== null && currentTarget !== 0) {
      // La pantalla OTG actual calcula el seguimiento puntual contra su meta directa.
      return clampPercentage((current / currentTarget) * 100);
    }

    const legacyStart = asNumber(action.puntoPartida) ?? 0;
    const legacyTarget = asNumber(action.puntoLlegada);
    if (current !== null && legacyTarget !== null) {
      return calcRangePercentage(legacyStart, legacyTarget, current);
    }

    // Las acciones anteriores guardaban `alcanzado` directamente como porcentaje.
    if (current !== null) return clampPercentage(current);
  }

  return asNumber(action.porcentajeCompletado);
}

/**
 * Calcula el cumplimiento de un OTG con el formato actual de acciones y con
 * registros históricos que todavía usan `alcanzado`, `puntoPartida` y
 * `puntoLlegada`. El resultado queda siempre entre 0 y 100.
 */
export function calculateOtgProgress(row: UnknownRecord): number {
  const actions = Array.isArray(row.acciones) ? row.acciones.filter((action): action is UnknownRecord => Boolean(action) && typeof action === "object") : [];

  if (actions.length > 0) {
    const weighted = actions.map(action => ({
      percentage: currentActionPercentage(action) ?? 0,
      weight: asNumber(action.ponderacion) ?? 0,
    }));
    const totalWeight = weighted.reduce((sum, action) => sum + Math.max(0, action.weight), 0);
    if (totalWeight > 0) {
      return clampPercentage(
        weighted.reduce((sum, action) => sum + action.percentage * (Math.max(0, action.weight) / totalWeight), 0)
      );
    }
    return clampPercentage(weighted.reduce((sum, action) => sum + action.percentage, 0) / weighted.length);
  }

  const savedTaskProgress = asNumber(row.porcentajeCumplimiento);
  if (savedTaskProgress !== null) return clampPercentage(savedTaskProgress);

  const savedObjectiveProgress = asNumber(row.porcentajeAlcanzadoOTG);
  if (savedObjectiveProgress !== null) return clampPercentage(savedObjectiveProgress);

  const current = asNumber(row.alcanzado);
  const start = asNumber(row.puntoPartida) ?? 0;
  const target = asNumber(row.puntoLlegada);
  if (current !== null && target !== null) {
    return calcRangePercentage(start, target, current) ?? 0;
  }

  return 0;
}
