import jsPDF from "jspdf";
import * as XLSX from "xlsx";

export type PayrollExportEmployee = {
  fullName: string;
  identityCard: string;
  hireDate: string | Date;
  area: string;
  position: string;
  terminationDate?: string | Date | null;
};

const asLocalDate = (value: string | Date | null | undefined) => {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  const isoDate = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return isoDate ? new Date(`${isoDate}T12:00:00`) : null;
};

export const formatPayrollDate = (value: string | Date | null | undefined) => {
  const date = asLocalDate(value);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "numeric" })
    : "—";
};

export const formatPayrollTenure = (hireDate: string | Date, until: string | Date | null = new Date()) => {
  const start = asLocalDate(hireDate);
  const end = asLocalDate(until) || new Date();
  if (!start || Number.isNaN(start.getTime()) || start > end) return "—";

  const elapsedDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
  if (elapsedDays < 30) return `${elapsedDays} ${elapsedDays === 1 ? "día" : "días"}`;

  let totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) totalMonths--;
  totalMonths = Math.max(1, totalMonths);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months || 1} ${months === 1 ? "mes" : "meses"}`;
  if (months === 0) return `${years} ${years === 1 ? "año" : "años"}`;
  return `${years} ${years === 1 ? "año" : "años"} ${months} ${months === 1 ? "mes" : "meses"}`;
};

type ExportColumn = { header: string; width: number; value: (employee: PayrollExportEmployee) => string };

const activeColumns: ExportColumn[] = [
  { header: "Nombre completo", width: 34, value: (e) => e.fullName },
  { header: "Cédula C.I.", width: 18, value: (e) => e.identityCard },
  { header: "Fecha de ingreso", width: 20, value: (e) => formatPayrollDate(e.hireDate) },
  { header: "Tiempo en la empresa", width: 22, value: (e) => formatPayrollTenure(e.hireDate) },
  { header: "Área", width: 26, value: (e) => e.area },
  { header: "Cargo", width: 34, value: (e) => e.position },
  { header: "Desempeño", width: 22, value: () => "Pendiente de evaluación" },
];

const inactiveColumns: ExportColumn[] = [
  { header: "Nombre completo", width: 34, value: (e) => e.fullName },
  { header: "Cédula C.I.", width: 18, value: (e) => e.identityCard },
  { header: "Fecha de ingreso", width: 20, value: (e) => formatPayrollDate(e.hireDate) },
  { header: "Tiempo en la empresa", width: 22, value: (e) => formatPayrollTenure(e.hireDate, e.terminationDate) },
  { header: "Área", width: 26, value: (e) => e.area },
  { header: "Cargo", width: 34, value: (e) => e.position },
  { header: "Fecha de desvinculación", width: 24, value: (e) => formatPayrollDate(e.terminationDate) },
];

const exportConfig = (kind: "activo" | "pasivo") => kind === "activo"
  ? { columns: activeColumns, title: "Nómina de Personal Activo", sheet: "Personal Activo", file: "nomina_personal_activo_isge360" }
  : { columns: inactiveColumns, title: "Historial de Personal Pasivo", sheet: "Personal Pasivo", file: "nomina_personal_pasivo_isge360" };

export const exportPayrollExcel = (employees: PayrollExportEmployee[], kind: "activo" | "pasivo") => {
  const config = exportConfig(kind);
  const rows = employees.map((employee) => Object.fromEntries(config.columns.map((column) => [column.header, column.value(employee)])));
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: config.columns.map((column) => column.header) });
  worksheet["!cols"] = config.columns.map((column) => ({ wch: column.width }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, config.sheet);
  XLSX.writeFile(workbook, `${config.file}.xlsx`);
};

export const exportPayrollPdf = (employees: PayrollExportEmployee[], kind: "activo" | "pasivo") => {
  const config = exportConfig(kind);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const totalWidth = pageWidth - margin * 2;
  const widthTotal = config.columns.reduce((sum, column) => sum + column.width, 0);
  const columnWidths = config.columns.map((column) => totalWidth * (column.width / widthTotal));
  let y = 17;

  const drawHeader = () => {
    doc.setFillColor(16, 103, 164);
    doc.rect(margin, 8, totalWidth, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text(`ISGE 360 · ${config.title}`, margin + 4, 14);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString("es-EC")} · Registros: ${employees.length}`, margin, 23);
    y = 27;
    let x = margin;
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, totalWidth, 7, "F");
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    config.columns.forEach((column, index) => {
      doc.text(column.header, x + 1.5, y + 4.5, { maxWidth: columnWidths[index] - 3 });
      x += columnWidths[index];
    });
    y += 7;
  };

  drawHeader();
  doc.setFontSize(7);
  employees.forEach((employee, rowIndex) => {
    const values = config.columns.map((column) => column.value(employee));
    const lines = values.map((value, index) => doc.splitTextToSize(value || "—", columnWidths[index] - 3));
    const rowHeight = Math.max(7, ...lines.map((value) => value.length * 3.2 + 2));
    if (y + rowHeight > pageHeight - 10) {
      doc.addPage();
      drawHeader();
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, totalWidth, rowHeight, "F");
    }
    let x = margin;
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, totalWidth, rowHeight);
    lines.forEach((value, index) => {
      doc.text(value, x + 1.5, y + 4, { maxWidth: columnWidths[index] - 3 });
      if (index < columnWidths.length - 1) doc.line(x + columnWidths[index], y, x + columnWidths[index], y + rowHeight);
      x += columnWidths[index];
    });
    y += rowHeight;
  });

  doc.save(`${config.file}.pdf`);
};
