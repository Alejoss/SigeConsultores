export type FODAType = 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';
export type FactorType = 'Humano' | 'Tecnológico' | 'Natural';
export type SistemaGestionType = 'Calidad' | 'Ambiente' | 'SSO' | 'Seguridad Física' | 'Responsabilidad Social' | 'Otro';
export type ComunicadoType = 'SI' | 'NO';
export type MejoraImplementadaType = 'SI' | 'NO';
export type ObjetivoLogradoType = 'SI' | 'NO';
export type ProbabilidadType = 'A' | 'B' | 'C' | 'D' | 'E';
export type ImpactoType = 1 | 2 | 3 | 4 | 5;
export type EstimacionType = 'Crítico' | 'Alto' | 'Medio' | 'Bajo';

/** Mantiene el valor histórico almacenado y actualiza únicamente el nombre visible. */
export const ETIQUETAS_SISTEMA_GESTION: Record<SistemaGestionType, string> = {
  Calidad: 'Calidad',
  Ambiente: 'Ambiente',
  SSO: 'SSO',
  'Seguridad Física': 'Sistema de Gestión en Control y Seguridad',
  'Responsabilidad Social': 'Responsabilidad Social',
  Otro: 'Otro',
};

/**
 * Los códigos se conservan tal como están almacenados históricamente en la
 * matriz: Probabilidad A–E e Impacto 1–5. Estas leyendas solo explican su
 * significado visible y no convierten ni reescriben evaluaciones anteriores.
 */
export const ESCALA_PROBABILIDAD = [
  { value: 'A', nombre: 'Frecuente', descripcion: 'Es probable que suceda muchas veces; ha ocurrido frecuentemente.' },
  { value: 'B', nombre: 'Ocasional', descripcion: 'Es posible que suceda algunas veces; ha ocurrido con poca frecuencia.' },
  { value: 'C', nombre: 'Remoto', descripcion: 'Es poco probable que ocurra, pero no imposible; rara vez ha ocurrido.' },
  { value: 'D', nombre: 'Improbable', descripcion: 'Es muy poco probable que ocurra; no se sabe si ha ocurrido.' },
  { value: 'E', nombre: 'Sumamente improbable', descripcion: 'Es casi inconcebible que ocurra el evento.' },
] as const satisfies ReadonlyArray<{ value: ProbabilidadType; nombre: string; descripcion: string }>;

export const ESCALA_IMPACTO = [
  { value: 5, nombre: 'Catastrófico', descripcion: 'Equipo destruido o varias muertes.' },
  { value: 4, nombre: 'Peligroso', descripcion: 'Reducción grave de márgenes de seguridad, lesiones graves o daño importante a equipos e instalaciones.' },
  { value: 3, nombre: 'Grave', descripcion: 'Afectación importante a la seguridad u operación, incidente grave o lesiones para las personas.' },
  { value: 2, nombre: 'Leve', descripcion: 'Molestias, limitaciones operacionales, uso de procedimiento de emergencia o incidente leve.' },
  { value: 1, nombre: 'Insignificante', descripcion: 'Pocas consecuencias.' },
] as const satisfies ReadonlyArray<{ value: ImpactoType; nombre: string; descripcion: string }>;

/** Presentación simplificada solicitada: rojo = grave, amarillo = medio, verde = bajo. */
export type CategoriaVisualRiesgo = 'Grave' | 'Medio' | 'Bajo';

export const PRESENTACION_RIESGO: Record<EstimacionType, {
  categoria: CategoriaVisualRiesgo;
  className: string;
  cellClassName: string;
}> = {
  Crítico: { categoria: 'Grave', className: 'bg-red-600 text-white', cellClassName: 'bg-red-100 text-red-800' },
  Alto: { categoria: 'Grave', className: 'bg-red-600 text-white', cellClassName: 'bg-red-100 text-red-800' },
  Medio: { categoria: 'Medio', className: 'bg-yellow-300 text-slate-800', cellClassName: 'bg-yellow-100 text-yellow-900' },
  Bajo: { categoria: 'Bajo', className: 'bg-green-600 text-white', cellClassName: 'bg-green-100 text-green-800' },
};

export function obtenerPresentacionRiesgo(estimacion?: EstimacionType) {
  return estimacion ? PRESENTACION_RIESGO[estimacion] : null;
}

export function describirProbabilidad(valor?: ProbabilidadType): string {
  const escala = ESCALA_PROBABILIDAD.find((item) => item.value === valor);
  return escala ? `${escala.value} — ${escala.nombre}` : valor || '-';
}

export function describirImpacto(valor?: ImpactoType): string {
  const escala = ESCALA_IMPACTO.find((item) => item.value === valor);
  return escala ? `${escala.value} — ${escala.nombre}` : valor ? String(valor) : '-';
}

// ─── Tipos OTG ────────────────────────────────────────────────────────────────
export type TrackingOTGType = 'puntual' | 'mensual_sumatoria' | 'mensual_promedio' | 'mensual_checklist';
export const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'Mayo', 'Jun', 'Jul', 'Agos', 'Sep', 'Oct', 'Nov', 'Dic'];
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
  /** Identidad persistente del FODA de origen en filas nuevas. */
  sourceFodaElementId?: string;
  /** Vínculo canónico del Objetivo de la Política; el texto conserva el histórico. */
  policyObjectiveId?: number | null;
  policyObjectiveDescription?: string;
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
