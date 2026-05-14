import jsPDF from 'jspdf';

interface SubprocessRow {
  entrada: string;
  subproceso: string;
  salida: string;
}

export const exportSubprocessMapToPDF = (data: { entrada: SubprocessRow[]; subprocesos: SubprocessRow[]; salida: SubprocessRow[] }, processName: string) => {
  try {
    const doc = new jsPDF('l'); // Landscape orientation
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
    doc.text('MAPA DE SUBPROCESOS', margin, yPosition);
    yPosition += 10;

    // Company and Process Info
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    yPosition = addTextWithLineBreaks(`Proceso: ${processName}`, margin, yPosition, maxWidth, 11);
    yPosition = addTextWithLineBreaks(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, margin, yPosition, maxWidth, 10);
    yPosition += 8;

    // Helper function to render a section
    const renderSection = (title: string, rows: SubprocessRow[], color: [number, number, number]) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(...color);
      doc.text(title, margin, yPosition);
      yPosition += 8;

      if (rows.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        yPosition = addTextWithLineBreaks('(Sin datos)', margin + 5, yPosition, maxWidth - 5, 10);
        yPosition += 5;
        return;
      }

      // Render each row
      rows.forEach((row, idx) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        yPosition = addTextWithLineBreaks(`${idx + 1}. ${row.subproceso || '(vacío)'}`, margin, yPosition, maxWidth, 10);
        
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        if (row.entrada) yPosition = addTextWithLineBreaks(`Entrada: ${row.entrada}`, margin + 5, yPosition, maxWidth - 5, 9);
        if (row.salida) yPosition = addTextWithLineBreaks(`Salida: ${row.salida}`, margin + 5, yPosition, maxWidth - 5, 9);
        yPosition += 3;
      });

      yPosition += 5;
    };

    // Render sections
    renderSection('ENTRADA', data.entrada, [34, 197, 94]); // Green
    renderSection('SUBPROCESOS', data.subprocesos, [59, 130, 246]); // Blue
    renderSection('SALIDA', data.salida, [249, 115, 22]); // Orange

    // Save PDF
    const fileName = `MapaSubprocesos_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
