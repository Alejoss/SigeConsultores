export type FODAType = 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';
export type FactorType = 'Humano' | 'Tecnológico' | 'Natural';
export type SistemaGestionType = 'Calidad' | 'Ambiente' | 'SSO' | 'Seguridad Física' | 'Responsabilidad Social' | 'Otro';
export type ComunicadoType = 'SI' | 'NO';
export type MejoraImplementadaType = 'SI' | 'NO';
export type ObjetivoLogradoType = 'SI' | 'NO';
export type ProbabilidadType = 'A' | 'B' | 'C' | 'D' | 'E';
export type ImpactoType = 1 | 2 | 3 | 4 | 5;
export type EstimacionType = 'Crítico' | 'Alto' | 'Medio' | 'Bajo';

// ─── Tipos OTG ────────────────────────────────────────────────────────────────
export type TrackingOTGType = 'puntual' | 'mensual_sumatoria' | 'mensual_promedio' | 'mensual_checklist';
export const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export interface AccionOTG {
  id: string;
  accion: string;
  ponderacion: number;
  responsable: string;
  fechaImplementacion: string;
  tipoSeguimiento: TrackingOTGType;
  valorPuntual?: number;
  puntoPartidaAccion?: number;
  puntoLlegadaAccion?: number;
  unidadMedidaAccion?: string;
  monthlyValues?: number[];
  checklistValues?: boolean[];
  porcentajeCompletado: number;
}
export function calcularPorcentajeAccion(accion: AccionOTG): number {
  switch (accion.tipoSeguimiento) {
    case 'puntual': {
      const llegada = accion.puntoLlegadaAccion ?? 0;
      if (llegada === 0) return 0;
      return Math.min(100, Math.max(0, Math.round(((accion.valorPuntual ?? 0) / llegada) * 100)));
    }
    case 'mensual_sumatoria': {
      const vals = accion.monthlyValues || Array(12).fill(0);
      const suma = vals.reduce((s: number, v: number) => s + (v || 0), 0);
      const partida = accion.puntoPartidaAccion ?? 0;
      const llegada = accion.puntoLlegadaAccion ?? 0;
      if (llegada === partida) return 0;
      return Math.min(100, Math.max(0, Math.round(((suma - partida) / (llegada - partida)) * 100)));
    }
    case 'mensual_promedio': {
      const vals = accion.monthlyValues || Array(12).fill(0);
      const nonZero = vals.filter((v: number) => v > 0);
      const promedio = nonZero.length > 0 ? nonZero.reduce((s: number, v: number) => s + v, 0) / nonZero.length : 0;
      const partida = accion.puntoPartidaAccion ?? 0;
      const llegada = accion.puntoLlegadaAccion ?? 0;
      if (llegada === partida) return 0;
      return Math.min(100, Math.max(0, Math.round(((promedio - partida) / (llegada - partida)) * 100)));
    }
    case 'mensual_checklist': {
      const vals = accion.checklistValues || Array(12).fill(false);
      const cumplidos = vals.filter((v: boolean) => v).length;
      return Math.round((cumplidos / 12) * 100);
    }
    default:
      return 0;
  }
}
export function calcularPorcentajeOTG(acciones: AccionOTG[]): number {
  if (!acciones || acciones.length === 0) return 0;
  const totalPonderacion = acciones.reduce((s, a) => s + (a.ponderacion || 0), 0);
  if (totalPonderacion === 0) {
    const suma = acciones.reduce((s, a) => s + calcularPorcentajeAccion(a), 0);
    return Math.round(suma / acciones.length);
  }
  const ponderado = acciones.reduce((s, a) => {
    const pct = calcularPorcentajeAccion(a);
    return s + pct * (a.ponderacion / totalPonderacion);
  }, 0);
  return Math.round(ponderado);
}

export interface MatrizFODARow {
  id: number;
  
  // Identificación
  subproceso: string;
  objetivoPolitica?: string;
  elemento: string;
  foda: FODAType;
  factor: FactorType;
  consecuencia: string;
  sistemaGestion: SistemaGestionType;
  otroSistemaGestion?: string;
  
  // Valoración (solo para Debilidades y Amenazas)
  probabilidad?: ProbabilidadType;
  impacto?: ImpactoType;
  nivelRiesgo?: string;
  estimacion?: EstimacionType;
  
  // Planificación de acciones
  accionATomar: string;
  planContingencia: string;
  planContinuidad: string;
  simulacro: string;
  fechaInicial?: string;
  fechaFinalPrevista?: string;
  diasRestantes?: number;
  
  // Comunicación
  comunicado: ComunicadoType;
  partesInteresadas: string;
  evidencia: string;
  
  // OTG
  objetivoTactico?: string;
  puntoPartida?: number;
  puntoLlegada?: number;
  unidadMedida?: string;
  responsableOTG?: string;
  alcanzado?: number;
  porcentajeAlcanzadoOTG?: number;
  fechaPlanificacionMejora?: string;
  acciones?: AccionOTG[];
  porcentajeCumplimiento?: number;

  // Seguimiento y reevaluación
  mejoraImplementada: MejoraImplementadaType;
  observacion: string;
  medioVerificacion: string;
  fechaImplementacion?: string;
  objetivoLogrado: ObjetivoLogradoType;
  probabilidadNueva?: ProbabilidadType;
  nivelRiesgoNuevo?: string;
  estimacionNueva?: EstimacionType;
}

export interface MatrizFODAIndicadores {
  totalPlanificado: number;
  totalAlcanzado: number;
  porcentajeComunicado: number;
  alcancePorSistema: {
    Calidad: { alcanzados: number; total: number; porcentaje: number };
    Ambiente: { alcanzados: number; total: number; porcentaje: number };
    SSO: { alcanzados: number; total: number; porcentaje: number };
    'Seguridad Física': { alcanzados: number; total: number; porcentaje: number };
    'Responsabilidad Social': { alcanzados: number; total: number; porcentaje: number };
    Otro: { alcanzados: number; total: number; porcentaje: number };
  };
}

export const MATRIZ_RIESGO: Record<string, { estimacion: EstimacionType; color: string }> = {
  // Fila A (Probabilidad más alta)
  'A1': { estimacion: 'Crítico', color: 'bg-red-600' },
  'A2': { estimacion: 'Crítico', color: 'bg-red-600' },
  'A3': { estimacion: 'Crítico', color: 'bg-red-600' },
  'A4': { estimacion: 'Crítico', color: 'bg-red-600' },
  'A5': { estimacion: 'Crítico', color: 'bg-red-600' },
  // Fila B
  'B1': { estimacion: 'Alto', color: 'bg-yellow-500' },
  'B2': { estimacion: 'Crítico', color: 'bg-red-600' },
  'B3': { estimacion: 'Crítico', color: 'bg-red-600' },
  'B4': { estimacion: 'Crítico', color: 'bg-red-600' },
  'B5': { estimacion: 'Crítico', color: 'bg-red-600' },
  // Fila C
  'C1': { estimacion: 'Medio', color: 'bg-yellow-300' },
  'C2': { estimacion: 'Alto', color: 'bg-yellow-500' },
  'C3': { estimacion: 'Alto', color: 'bg-yellow-500' },
  'C4': { estimacion: 'Crítico', color: 'bg-red-600' },
  'C5': { estimacion: 'Crítico', color: 'bg-red-600' },
  // Fila D
  'D1': { estimacion: 'Bajo', color: 'bg-green-500' },
  'D2': { estimacion: 'Medio', color: 'bg-yellow-300' },
  'D3': { estimacion: 'Medio', color: 'bg-yellow-300' },
  'D4': { estimacion: 'Alto', color: 'bg-yellow-500' },
  'D5': { estimacion: 'Crítico', color: 'bg-red-600' },
  // Fila E (Probabilidad más baja)
  'E1': { estimacion: 'Bajo', color: 'bg-green-500' },
  'E2': { estimacion: 'Bajo', color: 'bg-green-500' },
  'E3': { estimacion: 'Medio', color: 'bg-yellow-300' },
  'E4': { estimacion: 'Medio', color: 'bg-yellow-300' },
  'E5': { estimacion: 'Alto', color: 'bg-yellow-500' },
};

export function calcularNivelRiesgo(probabilidad?: ProbabilidadType, impacto?: ImpactoType): { nivelRiesgo: string; estimacion: EstimacionType; color: string } | null {
  if (!probabilidad || !impacto) return null;
  const key = `${probabilidad}${impacto}`;
  const riesgo = MATRIZ_RIESGO[key];
  if (!riesgo) return null;
  return {
    nivelRiesgo: `${key} (${riesgo.estimacion})`,
    estimacion: riesgo.estimacion,
    color: riesgo.color,
  };
}
