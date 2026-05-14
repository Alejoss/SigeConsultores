export type CategoriaObjetivoType = 'Finanzas' | 'Cliente' | 'Procesos Internos' | 'Aprendizaje' | 'Crecimiento';
export type CumplidoType = 'SI' | 'NO';

export interface ObjetivoEstrategico {
  id: number;
  enunciado: string;
  descripcion: string;
}

export interface Subproceso {
  id: number;
  nombre: string;
}

export interface ResultadoClave {
  id: number;
  descripcion: string;
  responsable: string;
  fechaInicial: string;
  fechaFinal: string;
  fechaImplementacion: string;
  cumplido: CumplidoType;
  observacion: string;
  diasRestantes?: number;
}

export interface ObjetivoTacticoDefinicion {
  id: number;
  subprocesoId: number;
  subprocesoNombre: string;
  objetivoEstrategicoId: number;
  objetivoEstrategicoEnunciado: string;
  objetivoEstrategicoDescripcion: string;
  enunciado: string;
  explicacion: string;
  responsable: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ObjetivoTacticoPlanificacion {
  id: number;
  objetivoTacticoId: number;
  enunciado: string;
  responsable: string;
  categoria: CategoriaObjetivoType;
  meta: number; // Porcentaje
  porcentajePrevisto: number;
  porcentajeActual: number;
  resultadosClave: ResultadoClave[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ObjetivosTacticosState {
  definiciones: ObjetivoTacticoDefinicion[];
  planificaciones: ObjetivoTacticoPlanificacion[];
}
