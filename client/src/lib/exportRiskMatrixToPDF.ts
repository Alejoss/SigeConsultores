import jsPDF from 'jspdf';

interface MatrizFODARow {
  id?: number;
  enunciado: string;
  tipo: 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';
  sistemaGestion: string;
  probabilidad: string;
  impacto: string;
  nivelRiesgo: string;
  evaluacion: string;
}

export const exportRiskMatrixToPDF = (rows: MatrizFODARow[], processName: string) => {
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
    doc.text('MATRIZ DEL FODA', margin, yPosition);
    yPosition += 10;

    // Company and Process Info
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    yPosition = addTextWithLineBreaks(`Proceso: ${processName}`, margin, yPosition, maxWidth, 11);
    yPosition = addTextWithLineBreaks(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, margin, yPosition, maxWidth, 10);
    yPosition = addTextWithLineBreaks(`Total de Elementos: ${rows.length}`, margin, yPosition, maxWidth, 10);
    yPosition += 8;

    if (rows.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(150, 150, 150);
      doc.text('No hay elementos en la matriz', margin, yPosition);
      const fileName = `MatrizFODA_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      return true;
    }

    // Render each row as a card-like structure
    rows.forEach((row, idx) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // Background color
      const bgColor = idx % 2 === 0 ? [245, 245, 245] : [255, 255, 255];
      doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      doc.rect(margin, yPosition - 3, maxWidth, 30, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(margin, yPosition - 3, maxWidth, 30);

      // Get color based on tipo
      let tipoColor = [0, 0, 0];
      if (row.tipo === 'Fortaleza') tipoColor = [34, 197, 94]; // Green
      else if (row.tipo === 'Oportunidad') tipoColor = [59, 130, 246]; // Blue
      else if (row.tipo === 'Debilidad') tipoColor = [249, 115, 22]; // Orange
      else if (row.tipo === 'Amenaza') tipoColor = [239, 68, 68]; // Red

      // Row number and Enunciado
      doc.setFontSize(9);
      doc.setTextColor(tipoColor[0], tipoColor[1], tipoColor[2]);
      (doc.setFont as any)(undefined, 'bold');
      const enunciadoText = `${idx + 1}. ${row.enunciado.substring(0, 50)}${row.enunciado.length > 50 ? '...' : ''}`;
      doc.text(enunciadoText, margin + 5, yPosition + 3);
      (doc.setFont as any)(undefined, 'normal');

      // Details in smaller font
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      yPosition += 8;
      
      const details = [
        `Tipo: ${row.tipo}`,
        `Sistema: ${row.sistemaGestion}`,
        `Probabilidad: ${row.probabilidad}`,
        `Impacto: ${row.impacto}`,
        `Nivel: ${row.nivelRiesgo}`,
        `Evaluación: ${row.evaluacion.substring(0, 30)}${row.evaluacion.length > 30 ? '...' : ''}`
      ];

      const colWidth = maxWidth / 3;
      let col = 0;
      details.forEach((detail, idx) => {
        const xPos = margin + 5 + (col * colWidth);
        doc.text(detail, xPos, yPosition);
        col++;
        if (col >= 3) {
          col = 0;
          yPosition += 5;
        }
      });

      yPosition += 10;
    });

    // Save PDF
    const fileName = `MatrizFODA_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
