export function download(
  content: string,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function csv(
  headers: string[],
  rows: (string | number)[][],
  name: string,
) {
  const escape = (v: string | number) => {
    let s = String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  download(
    "\uFEFF" +
      [headers, ...rows].map((r) => r.map(escape).join(";")).join("\r\n"),
    name,
    "text/csv;charset=utf-8",
  );
}
