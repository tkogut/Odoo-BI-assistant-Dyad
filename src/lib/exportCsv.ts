export function exportToCsv(filename: string, columns: string[], rows: unknown[][]) {
  const escapeCell = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // Escape quotes
    const escaped = s.replace(/"/g, '""');
    // Wrap if needed
    if (escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')) {
      return `"${escaped}"`;
    }
    return escaped;
  };

  const header = columns.map(escapeCell).join(",");
  const body = rows.map((r) => r.map(escapeCell).join(",")).join("\n");
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}