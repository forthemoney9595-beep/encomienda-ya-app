// Genera y descarga un archivo CSV directamente en el navegador.
// No necesita servidor — usa los datos ya cargados en la página.
export function downloadCsv(
  rows: Record<string, string | number | null | undefined>[],
  filename: string
): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const escape = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    // Si contiene coma, comillas o salto de línea, envolver en comillas y escapar
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const csv = [
    headers.map(escape).join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(','))
  ].join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
