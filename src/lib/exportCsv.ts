export function exportToCsv(filename: string, columns: string[], rows: unknown[][]) {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    // If contains double quotes, escape them by doubling
    const escaped = s.replace(/"/g, '""');
    // Wrap in quotes if it contains commas, quotes, or newlines
    if (/[",\n]/.test(escaped)) {
      return `"${escaped}"`;
    }
    return escaped;
  };

  const header = columns.join(",") + "\n";
  const body = rows.map((r) => r.map(escape).join(",")).join("\n");
  const csv = header + body;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}