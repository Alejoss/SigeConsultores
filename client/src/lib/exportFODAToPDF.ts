import jsPDF from 'jspdf';

interface FODAElement {
  id: number;
  type: 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';
  subprocess: string;
  policyObjective: string;
  selectedObjectiveContent: string;
  statement: string;
  description: string;
}

export const exportFODAToPDF = (elements: FODAElement[], processName: string) => {
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
      doc.text(lines, x, y);
      return y + (lines.length * 5) + 5;
    };

    // Title
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text('ANALISIS FODA', margin, yPosition);
    yPosition += 10;

    // Company and Process Info
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    yPosition = addTextWithLineBreaks(`Proceso: ${processName}`, margin, yPosition, maxWidth, 11);
    yPosition = addTextWithLineBreaks(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, margin, yPosition, maxWidth, 10);
    yPosition += 5;

    // Fortalezas
    const fortalezas = elements.filter(e => e.type === 'Fortaleza');
    if (fortalezas.length > 0) {
      doc.setFontSize(13);
      doc.setTextColor(34, 197, 94);
      doc.text('FORTALEZAS', margin, yPosition);
      yPosition += 8;

      fortalezas.forEach((item, idx) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        yPosition = addTextWithLineBreaks(`${idx + 1}. ${item.statement}`, margin, yPosition, maxWidth, 10);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        yPosition = addTextWithLineBreaks(`Descripcion: ${item.description}`, margin + 5, yPosition, maxWidth - 5, 9);
        if (item.subprocess) yPosition = addTextWithLineBreaks(`Subproceso: ${item.subprocess}`, margin + 5, yPosition, maxWidth - 5, 9);
        yPosition += 3;
      });
      yPosition += 5;
    }

    // Oportunidades
    const oportunidades = elements.filter(e => e.type === 'Oportunidad');
    if (oportunidades.length > 0) {
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = 20;
      }
      doc.setFontSize(13);
      doc.setTextColor(59, 130, 246);
      doc.text('OPORTUNIDADES', margin, yPosition);
      yPosition += 8;

      oportunidades.forEach((item, idx) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        yPosition = addTextWithLineBreaks(`${idx + 1}. ${item.statement}`, margin, yPosition, maxWidth, 10);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        yPosition = addTextWithLineBreaks(`Descripcion: ${item.description}`, margin + 5, yPosition, maxWidth - 5, 9);
        if (item.subprocess) yPosition = addTextWithLineBreaks(`Subproceso: ${item.subprocess}`, margin + 5, yPosition, maxWidth - 5, 9);
        yPosition += 3;
      });
      yPosition += 5;
    }

    // Debilidades
    const debilidades = elements.filter(e => e.type === 'Debilidad');
    if (debilidades.length > 0) {
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = 20;
      }
      doc.setFontSize(13);
      doc.setTextColor(249, 115, 22);
      doc.text('DEBILIDADES', margin, yPosition);
      yPosition += 8;

      debilidades.forEach((item, idx) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        yPosition = addTextWithLineBreaks(`${idx + 1}. ${item.statement}`, margin, yPosition, maxWidth, 10);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        yPosition = addTextWithLineBreaks(`Descripcion: ${item.description}`, margin + 5, yPosition, maxWidth - 5, 9);
        if (item.subprocess) yPosition = addTextWithLineBreaks(`Subproceso: ${item.subprocess}`, margin + 5, yPosition, maxWidth - 5, 9);
        yPosition += 3;
      });
      yPosition += 5;
    }

    // Amenazas
    const amenazas = elements.filter(e => e.type === 'Amenaza');
    if (amenazas.length > 0) {
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = 20;
      }
      doc.setFontSize(13);
      doc.setTextColor(239, 68, 68);
      doc.text('AMENAZAS', margin, yPosition);
      yPosition += 8;

      amenazas.forEach((item, idx) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        yPosition = addTextWithLineBreaks(`${idx + 1}. ${item.statement}`, margin, yPosition, maxWidth, 10);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        yPosition = addTextWithLineBreaks(`Descripcion: ${item.description}`, margin + 5, yPosition, maxWidth - 5, 9);
        if (item.subprocess) yPosition = addTextWithLineBreaks(`Subproceso: ${item.subprocess}`, margin + 5, yPosition, maxWidth - 5, 9);
        yPosition += 3;
      });
    }

    // Save PDF
    const fileName = `FODA_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
