import jsPDF from 'jspdf';

interface MatrizFODARow {
  id?: number;
  elemento: string;
  foda: 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';
  factor: string;
  consecuencia?: string;
  sistemaGestion: string;
  probabilidad?: string;
  impacto?: number;
  nivelRiesgo?: string;
  accionATomar?: string;
  accionDeAprovechamiento?: string;
  planContingencia?: string;
  planContinuidad?: string;
  simulacro?: string;
  fechaPlanificacionMejora?: string;
  fechaFinalPrevista?: string;
  comunicado?: string;
  partesInteresadas?: string;
  evidencia?: string;
  mejoraImplementada?: string;
  observacion?: string;
  medioVerificacion?: string;
  fechaImplementacion?: string;
  objetivoLogrado?: string;
}

export const exportMatrizFODAToPDF = (matrixRows: MatrizFODARow[], processName: string) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;
    const margin = 10;
    const maxWidth = pageWidth - 2 * margin;

    // Helper functions
    const addNewPage = () => {
      doc.addPage();
      yPosition = 15;
    };

    const addTitle = (text: string) => {
      if (yPosition > pageHeight - 40) addNewPage();
      doc.setFontSize(18);
      doc.setTextColor(30, 58, 138);
      doc.text(text, margin, yPosition);
      yPosition += 10;
    };

    const addSectionTitle = (title: string, color: [number, number, number]) => {
      if (yPosition > pageHeight - 35) addNewPage();
      doc.setFontSize(13);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(title, margin, yPosition);
      yPosition += 8;
    };

    const addElementHeader = (number: number, elemento: string, color: [number, number, number]) => {
      if (yPosition > pageHeight - 30) addNewPage();
      doc.setFontSize(10);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(`${number}. ${elemento}`, maxWidth - 2);
      doc.text(lines as string[], margin + 2, yPosition);
      yPosition += lines.length * 4 + 2;
    };

    const addFieldTable = (fields: Array<[string, string]>) => {
      if (yPosition > pageHeight - 25) addNewPage();
      
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      
      const colWidth = (maxWidth - 4) / 2;
      const rowHeight = 5;
      
      fields.forEach((field) => {
        if (yPosition > pageHeight - 10) addNewPage();
        
        const [label, value] = field;
        const labelText = `${label}:`;
        
        // Draw label
        doc.setTextColor(80, 80, 80);
        doc.text(labelText, margin + 2, yPosition);
        
        // Draw value
        doc.setTextColor(50, 50, 50);
        const valueLines = doc.splitTextToSize(value || '-', colWidth - 10);
        doc.text(valueLines as string[], margin + 50, yPosition);
        
        yPosition += Math.max(rowHeight, valueLines.length * 3.5) + 1;
      });
    };

    const addSeparator = () => {
      if (yPosition > pageHeight - 15) return;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 4;
    };

    // Title and header
    addTitle('MATRIZ DEL FODA');
    
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Proceso: ${processName}`, margin, yPosition);
    yPosition += 4;
    doc.text(`Fecha de Generación: ${new Date().toLocaleDateString('es-ES')}`, margin, yPosition);
    yPosition += 8;

    // Separate rows by type
    const fortalezas = matrixRows.filter(r => r.foda === 'Fortaleza');
    const oportunidades = matrixRows.filter(r => r.foda === 'Oportunidad');
    const debilidades = matrixRows.filter(r => r.foda === 'Debilidad');
    const amenazas = matrixRows.filter(r => r.foda === 'Amenaza');

    // FORTALEZAS
    if (fortalezas.length > 0) {
      addSectionTitle('1. FORTALEZAS', [34, 197, 94]);
      addSeparator();
      
      fortalezas.forEach((item, idx) => {
        addElementHeader(idx + 1, item.elemento, [34, 197, 94]);
        
        const fields: Array<[string, string]> = [
          ['Sistema de Gestión', item.sistemaGestion || ''],
          ['Factor', item.factor || ''],
          ['Acción de Aprovechamiento', item.accionATomar || item.accionDeAprovechamiento || ''],
          ['Fecha Final Prevista', item.fechaFinalPrevista || ''],
        ];
        
        addFieldTable(fields);
        addSeparator();
        yPosition += 2;
      });
      yPosition += 4;
    }

    // OPORTUNIDADES
    if (oportunidades.length > 0) {
      addSectionTitle('2. OPORTUNIDADES', [59, 130, 246]);
      addSeparator();
      
      oportunidades.forEach((item, idx) => {
        addElementHeader(idx + 1, item.elemento, [59, 130, 246]);
        
        const fields: Array<[string, string]> = [
          ['Sistema de Gestión', item.sistemaGestion || ''],
          ['Factor', item.factor || ''],
          ['Acción de Aprovechamiento', item.accionATomar || item.accionDeAprovechamiento || ''],
          ['Fecha Final Prevista', item.fechaFinalPrevista || ''],
        ];
        
        addFieldTable(fields);
        addSeparator();
        yPosition += 2;
      });
      yPosition += 4;
    }

    // DEBILIDADES
    if (debilidades.length > 0) {
      addSectionTitle('3. DEBILIDADES', [249, 115, 22]);
      addSeparator();
      
      debilidades.forEach((item, idx) => {
        addElementHeader(idx + 1, item.elemento, [249, 115, 22]);
        
        const fields: Array<[string, string]> = [
          ['Sistema de Gestión', item.sistemaGestion || ''],
          ['Factor', item.factor || ''],
          ['Consecuencias', item.consecuencia || ''],
          ['Probabilidad', item.probabilidad || ''],
          ['Impacto', item.impacto ? item.impacto.toString() : ''],
          ['Nivel de Riesgo', item.nivelRiesgo || ''],
          ['Acción a Tomar', item.accionATomar || ''],
          ['Plan de Contingencia', item.planContingencia || ''],
          ['Plan de Continuidad del Negocio', item.planContinuidad || ''],
          ['Simulacro', item.simulacro || ''],
          ['Fecha Final Prevista', item.fechaFinalPrevista || ''],
        ];
        
        addFieldTable(fields);
        addSeparator();
        yPosition += 2;
      });
      yPosition += 4;
    }

    // AMENAZAS
    if (amenazas.length > 0) {
      addSectionTitle('4. AMENAZAS', [239, 68, 68]);
      addSeparator();
      
      amenazas.forEach((item, idx) => {
        addElementHeader(idx + 1, item.elemento, [239, 68, 68]);
        
        const fields: Array<[string, string]> = [
          ['Sistema de Gestión', item.sistemaGestion || ''],
          ['Factor', item.factor || ''],
          ['Consecuencias', item.consecuencia || ''],
          ['Probabilidad', item.probabilidad || ''],
          ['Impacto', item.impacto ? item.impacto.toString() : ''],
          ['Nivel de Riesgo', item.nivelRiesgo || ''],
          ['Acción a Tomar', item.accionATomar || ''],
          ['Plan de Contingencia', item.planContingencia || ''],
          ['Plan de Continuidad del Negocio', item.planContinuidad || ''],
          ['Simulacro', item.simulacro || ''],
          ['Fecha Final Prevista', item.fechaFinalPrevista || ''],
        ];
        
        addFieldTable(fields);
        addSeparator();
        yPosition += 2;
      });
    }

    // Save PDF
    const fileName = `MatrizFODA_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
