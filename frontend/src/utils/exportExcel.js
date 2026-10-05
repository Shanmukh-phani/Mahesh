import { format } from 'date-fns';
import { trackExport } from '../services/activity';

export const excelDate = (value) => (value ? format(new Date(value), 'dd-MM-yyyy hh:mm a') : '');
export const excelDay = (value) => (value ? format(new Date(value), 'dd-MM-yyyy') : '');

/**
 * Download rows (array of plain objects; keys become column headers) as an .xlsx file.
 */
const buildSheet = (XLSX, rows) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  ws['!cols'] = headers.map((h) => {
    const longest = rows.reduce((max, r) => Math.max(max, String(r[h] ?? '').length), h.length);
    return { wch: Math.min(Math.max(longest + 2, 10), 60) };
  });
  return ws;
};

export const downloadExcel = async (rows, { fileName, sheetName = 'Sheet1' }) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, rows), sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${fileName}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  trackExport(`${fileName}.xlsx`, rows.length);
};

/**
 * Download several sheets in one workbook: sheets = [{ name, rows }].
 * Sheet names are sanitised (Excel forbids []:*?/\ and limits names to 31 chars) and de-duplicated.
 */
export const downloadExcelSheets = async (sheets, { fileName }) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  sheets.forEach(({ name, rows }) => {
    const base = String(name || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Sheet';
    let sheetName = base;
    for (let i = 2; used.has(sheetName.toLowerCase()); i += 1) sheetName = `${base} ${i}`;
    used.add(sheetName.toLowerCase());
    XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, rows), sheetName);
  });
  XLSX.writeFile(wb, `${fileName}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  trackExport(`${fileName}.xlsx (${sheets.length} sheets)`, sheets.reduce((n, sh) => n + (sh.rows?.length || 0), 0));
};
