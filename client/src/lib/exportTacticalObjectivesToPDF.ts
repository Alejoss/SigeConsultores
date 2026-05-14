import jsPDF from 'jspdf';

interface Task {
  id: string;
  description: string;
  responsible: string;
  date: string;
  percentageCompleted: number;
  weighting: number;
}

interface ResultKey {
  id: string;
  description: string;
  responsible: string;
  startDate: string;
  endDate: string;
  implementationDate: string;
  observation: string;
  tasks: Task[];
  ponderacion?: number;
  puntoPartida?: number;
  metaLlegada?: number;
  unidadMedida?: string;
  avanceMeta?: number;
  porcentajeAlcanzado?: number;
}

interface TacticalPlanning {
  id: string;
  objectiveId: number;
  objectiveName: string;
  objectiveEnunciation: string;
  objectiveExplanation: string;
  objectiveResponsible: string;
  category: string;
  goal: string | number;
  resultKeys: ResultKey[];
  expanded: boolean;
  ponderacion?: number;
  puntoPartida?: number;
  metaLlegada?: number;
  unidadMedida?: string;
  avanceMeta?: number;
  porcentajeMetaAlcanzado?: number;
}

interface IndicadorGeneral {
  metaAlcanzada: number;
  alcanzadoPorOO: number;
  diferencia: number;
}

interface LegacyTacticalObjective {
  id?: number | string;
  subprocess: string;
  strategicObjective: string;
  enunciation: string;
  explanation: string;
  responsible: string;
}

type ExportData = TacticalPlanning | LegacyTacticalObjective;

const isTacticalPlanning = (obj: any): obj is TacticalPlanning => {
  return 'objectiveEnunciation' in obj && 'resultKeys' in obj;
};

export const exportTacticalObjectivesToPDF = (data: ExportData[], processName: string, indicadorGeneral?: IndicadorGeneral) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;

    const addTextWithLineBreaks = (text: string, x: number, y: number, maxW: number, fontSize: number = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxW);
      doc.text(lines as string[], x, y);
      return y + (lines.length * 5) + 5;
    };

    // Title
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text('PLANIFICACIÓN DE OBJETIVOS TÁCTICOS', margin, yPosition);
    yPosition += 10;

    // Company and Process Info
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    yPosition = addTextWithLineBreaks(`Proceso: ${processName}`, margin, yPosition, maxWidth, 11);
    yPosition = addTextWithLineBreaks(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Total de Objetivos Tácticos: ${data.length}`, margin, yPosition, maxWidth, 10);
    yPosition += 8;

    // Indicador General
    if (indicadorGeneral) {
      if (yPosition > pageHeight - 50) {
        doc.addPage();
        yPosition = 20;
      }
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      (doc.setFont as any)(undefined, 'bold');
      yPosition = addTextWithLineBreaks('INDICADOR GENERAL DE OBJETIVOS TACTICOS', margin, yPosition, maxWidth, 12);
      (doc.setFont as any)(undefined, 'normal');
      yPosition += 3;

      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      yPosition = addTextWithLineBreaks(`% Meta Alcanzada: ${indicadorGeneral.metaAlcanzada}%`, margin + 5, yPosition, maxWidth - 5, 9);
      yPosition = addTextWithLineBreaks(`% Alcanzado por OO: ${indicadorGeneral.alcanzadoPorOO}%`, margin + 5, yPosition, maxWidth - 5, 9);
      const diffSign = indicadorGeneral.diferencia > 0 ? '+' : '';
      yPosition = addTextWithLineBreaks(`% Diferencia: ${diffSign}${indicadorGeneral.diferencia}%`, margin + 5, yPosition, maxWidth - 5, 9);
      yPosition += 8;
    }

    if (data.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(150, 150, 150);
      doc.text('No hay objetivos tácticos registrados', margin, yPosition);
      const fileName = `PlanificacionObjetivosTacticos_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      return true;
    }

    // Render each tactical objective
    data.forEach((item, idx) => {
      if (yPosition > pageHeight - 50) {
        doc.addPage();
        yPosition = 20;
      }

      const isPlanningData = isTacticalPlanning(item);
      const planning = item as TacticalPlanning;
      const legacy = item as LegacyTacticalObjective;

      // Tactical Objective header
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      (doc.setFont as any)(undefined, 'bold');
      const title = isPlanningData ? planning.objectiveEnunciation : legacy.enunciation;
      yPosition = addTextWithLineBreaks(`${idx + 1}. ${title || '(Sin enunciado)'}`, margin, yPosition, maxWidth, 12);
      (doc.setFont as any)(undefined, 'normal');

      // Objective details
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      
      const explanation = isPlanningData ? planning.objectiveExplanation : legacy.explanation;
      if (explanation) {
        (doc.setFont as any)(undefined, 'bold');
        yPosition = addTextWithLineBreaks('Explicación:', margin + 5, yPosition, maxWidth - 5, 9);
        (doc.setFont as any)(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        yPosition = addTextWithLineBreaks(explanation, margin + 10, yPosition, maxWidth - 10, 9);
      }

      const responsible = isPlanningData ? planning.objectiveResponsible : legacy.responsible;
      if (responsible) {
        doc.setTextColor(80, 80, 80);
        (doc.setFont as any)(undefined, 'bold');
        yPosition = addTextWithLineBreaks('Responsable:', margin + 5, yPosition, maxWidth - 5, 9);
        (doc.setFont as any)(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        yPosition = addTextWithLineBreaks(responsible, margin + 10, yPosition, maxWidth - 10, 9);
      }

      // Additional fields for planning data
      if (isPlanningData) {
        if (planning.category) {
          doc.setTextColor(80, 80, 80);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('Categoría:', margin + 5, yPosition, maxWidth - 5, 9);
          (doc.setFont as any)(undefined, 'normal');
          doc.setTextColor(100, 100, 100);
          yPosition = addTextWithLineBreaks(planning.category, margin + 10, yPosition, maxWidth - 10, 9);
        }

        if (planning.goal) {
          doc.setTextColor(80, 80, 80);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('Meta:', margin + 5, yPosition, maxWidth - 5, 9);
          (doc.setFont as any)(undefined, 'normal');
          doc.setTextColor(100, 100, 100);
          yPosition = addTextWithLineBreaks(planning.goal.toString(), margin + 10, yPosition, maxWidth - 10, 9);
        }

        // Nuevos campos de Planificacion
        if (planning.ponderacion !== undefined) {
          doc.setTextColor(80, 80, 80);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('Ponderacion:', margin + 5, yPosition, maxWidth - 5, 9);
          (doc.setFont as any)(undefined, 'normal');
          doc.setTextColor(100, 100, 100);
          yPosition = addTextWithLineBreaks(`${planning.ponderacion}%`, margin + 10, yPosition, maxWidth - 10, 9);
        }

        if (planning.puntoPartida !== undefined) {
          doc.setTextColor(80, 80, 80);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('Condicion Inicial:', margin + 5, yPosition, maxWidth - 5, 9);
          (doc.setFont as any)(undefined, 'normal');
          doc.setTextColor(100, 100, 100);
          yPosition = addTextWithLineBreaks(planning.puntoPartida.toString(), margin + 10, yPosition, maxWidth - 10, 9);
        }

        if (planning.metaLlegada !== undefined) {
          doc.setTextColor(80, 80, 80);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('Meta (Punto de Llegada):', margin + 5, yPosition, maxWidth - 5, 9);
          (doc.setFont as any)(undefined, 'normal');
          doc.setTextColor(100, 100, 100);
          yPosition = addTextWithLineBreaks(planning.metaLlegada.toString(), margin + 10, yPosition, maxWidth - 10, 9);
        }

        if (planning.avanceMeta !== undefined) {
          doc.setTextColor(80, 80, 80);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('Condicion Actual (Avance):', margin + 5, yPosition, maxWidth - 5, 9);
          (doc.setFont as any)(undefined, 'normal');
          doc.setTextColor(100, 100, 100);
          yPosition = addTextWithLineBreaks(planning.avanceMeta.toString(), margin + 10, yPosition, maxWidth - 10, 9);
        }

        if (planning.porcentajeMetaAlcanzado !== undefined) {
          doc.setTextColor(80, 80, 80);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('% de Meta Alcanzado:', margin + 5, yPosition, maxWidth - 5, 9);
          (doc.setFont as any)(undefined, 'normal');
          doc.setTextColor(100, 100, 100);
          yPosition = addTextWithLineBreaks(`${planning.porcentajeMetaAlcanzado}%`, margin + 10, yPosition, maxWidth - 10, 9);
        }

        yPosition += 5;

        // Operational Objectives
        if (planning.resultKeys && planning.resultKeys.length > 0) {
          doc.setFontSize(11);
          doc.setTextColor(30, 58, 138);
          (doc.setFont as any)(undefined, 'bold');
          yPosition = addTextWithLineBreaks('Objetivos Operativos:', margin + 5, yPosition, maxWidth - 5, 11);
          (doc.setFont as any)(undefined, 'normal');

          planning.resultKeys.forEach((resultKey, rkIdx) => {
            if (yPosition > pageHeight - 40) {
              doc.addPage();
              yPosition = 20;
            }

            // Operational Objective
            doc.setFontSize(10);
            doc.setTextColor(50, 100, 150);
            (doc.setFont as any)(undefined, 'bold');
            yPosition = addTextWithLineBreaks(`${rkIdx + 1}. ${resultKey.description || '(Sin descripción)'}`, margin + 10, yPosition, maxWidth - 10, 10);
            (doc.setFont as any)(undefined, 'normal');

            // Operational Objective details
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            
            if (resultKey.responsible) {
              yPosition = addTextWithLineBreaks(`Responsable: ${resultKey.responsible}`, margin + 15, yPosition, maxWidth - 15, 8);
            }
            if (resultKey.startDate) {
              yPosition = addTextWithLineBreaks(`Inicio: ${resultKey.startDate}`, margin + 15, yPosition, maxWidth - 15, 8);
            }
            if (resultKey.endDate) {
              yPosition = addTextWithLineBreaks(`Fin: ${resultKey.endDate}`, margin + 15, yPosition, maxWidth - 15, 8);
            }
            if (resultKey.observation) {
              yPosition = addTextWithLineBreaks(`Observación: ${resultKey.observation}`, margin + 15, yPosition, maxWidth - 15, 8);
            }

            // Nuevos campos de Objetivo Operativo
            if (resultKey.ponderacion !== undefined) {
              yPosition = addTextWithLineBreaks(`Ponderacion: ${resultKey.ponderacion}%`, margin + 15, yPosition, maxWidth - 15, 8);
            }
            if (resultKey.puntoPartida !== undefined) {
              yPosition = addTextWithLineBreaks(`Condicion Inicial: ${resultKey.puntoPartida}`, margin + 15, yPosition, maxWidth - 15, 8);
            }
            if (resultKey.metaLlegada !== undefined) {
              yPosition = addTextWithLineBreaks(`Meta: ${resultKey.metaLlegada}`, margin + 15, yPosition, maxWidth - 15, 8);
            }
            if (resultKey.avanceMeta !== undefined) {
              yPosition = addTextWithLineBreaks(`Condicion Actual: ${resultKey.avanceMeta}`, margin + 15, yPosition, maxWidth - 15, 8);
            }
            if (resultKey.porcentajeAlcanzado !== undefined) {
              yPosition = addTextWithLineBreaks(`% Alcanzado: ${resultKey.porcentajeAlcanzado}%`, margin + 15, yPosition, maxWidth - 15, 8);
            }

            // Tasks
            if (resultKey.tasks && resultKey.tasks.length > 0) {
              doc.setFontSize(9);
              doc.setTextColor(80, 80, 80);
              (doc.setFont as any)(undefined, 'bold');
              yPosition = addTextWithLineBreaks('Tareas:', margin + 15, yPosition, maxWidth - 15, 9);
              (doc.setFont as any)(undefined, 'normal');

              resultKey.tasks.forEach((task, tIdx) => {
                if (yPosition > pageHeight - 30) {
                  doc.addPage();
                  yPosition = 20;
                }

                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                
                // Task number and description
                yPosition = addTextWithLineBreaks(
                  `${tIdx + 1}. ${task.description || '(Sin descripción)'}`,
                  margin + 20,
                  yPosition,
                  maxWidth - 20,
                  8
                );

                // Task details
                const taskDetails = [
                  task.date ? `Fecha: ${task.date}` : '',
                  task.weighting ? `Ponderación: ${task.weighting}%` : '',
                  task.responsible ? `Responsable: ${task.responsible}` : '',
                  task.percentageCompleted ? `% Completado: ${task.percentageCompleted}%` : ''
                ].filter(d => d).join(' | ');

                if (taskDetails) {
                  yPosition = addTextWithLineBreaks(taskDetails, margin + 25, yPosition, maxWidth - 25, 7);
                }

                yPosition += 2;
              });
            }

            yPosition += 5;
          });
        }
      }

      yPosition += 8;
    });

    // Save PDF
    const fileName = `PlanificacionObjetivosTacticos_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
