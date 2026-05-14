import jsPDF from 'jspdf';

interface StakeholderCriticality {
  id: string;
  name: string;
  internalExternal: string;
  needsSolicita: string;
  needsEntrega: string;
  incidenceCriteria: string[];
  incidenceValue: number[];
  riskCriteria: string[];
  riskValue: string[];
  criticityScore: string | number;
  existingDefenses: string;
  actionToTake: string;
  observations: string;
  startDate: string;
  endDate: string;
  completed: "Si" | "No";
}

const getCriticalityInfo = (incidenceValues: number[], riskValues: string[]) => {
  if (incidenceValues.length === 0 || riskValues.length === 0) {
    return { label: 'Sin evaluar', score: '', numericScore: 0 };
  }
  
  const maxIncidence = Math.max(...incidenceValues);
  const maxRisk = riskValues.sort().reverse()[0];
  const concatenatedScore = `${maxIncidence}${maxRisk}`;
  
  const riskNumValue = maxRisk === 'A' ? 3 : maxRisk === 'B' ? 2 : 1;
  const numericScore = maxIncidence * riskNumValue;

  if (numericScore === 9 || numericScore === 6) return { label: 'Crítico', score: concatenatedScore, numericScore };
  if (numericScore === 4 || numericScore === 3) return { label: 'Alto', score: concatenatedScore, numericScore };
  if (numericScore === 2 || numericScore === 1) return { label: 'Bajo', score: concatenatedScore, numericScore };
  return { label: 'Sin evaluar', score: '', numericScore: 0 };
};

export const exportStakeholderCriticalityToPDF = (stakeholders: StakeholderCriticality[], processName: string) => {
  try {
    const doc = new jsPDF('l'); // Landscape orientation
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;
    const margin = 10;
    const maxWidth = pageWidth - 2 * margin;

    const addTextWithLineBreaks = (text: string, x: number, y: number, maxW: number, fontSize: number = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxW);
      doc.text(lines as string[], x, y);
      return y + (lines.length * 4) + 3;
    };

    const addPageBreak = () => {
      doc.addPage();
      yPosition = 15;
    };

    // Title
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138);
    doc.text('MATRIZ DE CRITICIDAD DE ASOCIADOS DE NEGOCIO', margin, yPosition);
    yPosition += 8;

    // Process Info
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    yPosition = addTextWithLineBreaks(`Proceso: ${processName}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, margin, yPosition, maxWidth, 9);
    yPosition += 5;

    // ============ PRIMERA TABLA - MATRIZ DE CRITICIDAD ============
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text('PARTE 1: MATRIZ DE CRITICIDAD', margin, yPosition);
    yPosition += 6;

    // Table 1 Header
    const table1StartY = yPosition;
    const colWidths1 = [22, 18, 22, 22, 15, 20, 20];
    const colLabels1 = ['Asociado', 'Interno/Externo', 'Solicita', 'Entrega', 'Criticidad', 'Revisar', 'Solicitar'];
    const colX1 = [margin, margin + 22, margin + 40, margin + 62, margin + 84, margin + 99, margin + 119];

    // Draw header
    doc.setFillColor(34, 197, 94);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    
    colLabels1.forEach((label, idx) => {
      doc.text(label, colX1[idx], table1StartY, { maxWidth: colWidths1[idx] - 1, align: 'center' });
    });

    yPosition = table1StartY + 6;
    const table1RowHeight = 5;

    // Draw rows for table 1
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);

    stakeholders.forEach((stakeholder) => {
      if (yPosition > pageHeight - 50) {
        addPageBreak();
        // Redraw header
        doc.setFillColor(34, 197, 94);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        colLabels1.forEach((label, i) => {
          doc.text(label, colX1[i], yPosition, { maxWidth: colWidths1[i] - 1, align: 'center' });
        });
        yPosition += 6;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
      }

      const criticityInfo = getCriticalityInfo(stakeholder.incidenceValue, stakeholder.riskValue);
      
      // Draw row data for table 1
      const rowData1 = [
        stakeholder.name,
        stakeholder.internalExternal,
        stakeholder.needsSolicita.substring(0, 20),
        stakeholder.needsEntrega.substring(0, 20),
        criticityInfo.label,
        stakeholder.existingDefenses.substring(0, 20),
        stakeholder.actionToTake.substring(0, 20)
      ];

      rowData1.forEach((data, idx) => {
        doc.text(data, colX1[idx], yPosition, { maxWidth: colWidths1[idx] - 1, align: 'left' });
      });

      yPosition += table1RowHeight;
    });

    yPosition += 8;

    // ============ SEGUNDA TABLA - PLAN DE ACCIONES ============
    if (yPosition > pageHeight - 60) {
      addPageBreak();
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text('PARTE 2: PLAN DE ACCIONES PARA MEJORAR RELACIONES', margin, yPosition);
    yPosition += 6;

    // Table 2 Header
    const table2StartY = yPosition;
    const colWidths2 = [20, 25, 25, 25, 18, 18, 15];
    const colLabels2 = ['Asociado', 'Defensas Existentes', 'Acción a Tomar', 'Observaciones', 'Fecha Inicio', 'Fecha Fin', 'Realizado'];
    const colX2 = [margin, margin + 20, margin + 45, margin + 70, margin + 95, margin + 113, margin + 131];

    // Draw header
    doc.setFillColor(34, 197, 94);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    
    colLabels2.forEach((label, idx) => {
      doc.text(label, colX2[idx], table2StartY, { maxWidth: colWidths2[idx] - 1, align: 'center' });
    });

    yPosition = table2StartY + 6;
    const table2RowHeight = 8;

    // Draw rows for table 2
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);

    stakeholders.forEach((stakeholder) => {
      if (yPosition > pageHeight - 20) {
        addPageBreak();
        // Redraw header
        doc.setFillColor(34, 197, 94);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        colLabels2.forEach((label, i) => {
          doc.text(label, colX2[i], yPosition, { maxWidth: colWidths2[i] - 1, align: 'center' });
        });
        yPosition += 6;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
      }

      // Draw row data for table 2
      const rowData2 = [
        stakeholder.name,
        stakeholder.existingDefenses.substring(0, 25),
        stakeholder.actionToTake.substring(0, 25),
        stakeholder.observations.substring(0, 25),
        stakeholder.startDate ? new Date(stakeholder.startDate).toLocaleDateString('es-ES') : '',
        stakeholder.endDate ? new Date(stakeholder.endDate).toLocaleDateString('es-ES') : '',
        stakeholder.completed
      ];

      rowData2.forEach((data, idx) => {
        doc.text(String(data), colX2[idx], yPosition, { maxWidth: colWidths2[idx] - 1, align: 'left' });
      });

      yPosition += table2RowHeight;
    });

    yPosition += 10;

    // ============ RESUMEN ============
    if (yPosition > pageHeight - 40) {
      addPageBreak();
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text('RESUMEN', margin, yPosition);
    yPosition += 6;

    // Count criticality levels
    const criticalCount = stakeholders.filter(s => {
      const info = getCriticalityInfo(s.incidenceValue, s.riskValue);
      return info.label === 'Crítico';
    }).length;

    const highCount = stakeholders.filter(s => {
      const info = getCriticalityInfo(s.incidenceValue, s.riskValue);
      return info.label === 'Alto';
    }).length;

    const lowCount = stakeholders.filter(s => {
      const info = getCriticalityInfo(s.incidenceValue, s.riskValue);
      return info.label === 'Bajo';
    }).length;

    const completedCount = stakeholders.filter(s => s.completed === 'Si').length;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    yPosition = addTextWithLineBreaks(`Total de Asociados: ${stakeholders.length}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Críticos: ${criticalCount}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Altos: ${highCount}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Bajos: ${lowCount}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Acciones Completadas: ${completedCount}/${stakeholders.length}`, margin, yPosition, maxWidth, 10);

    // Save PDF
    const fileName = `MatrizCriticidad_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
