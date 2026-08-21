// Minimal hand-built PDF writer - no library dependency (none of the
// popular PDF generators run cleanly in the Workers runtime without
// nodejs_compat). Produces a plain-text, paginated, single-column PDF:
// enough for a real downloadable statement, not a stub file.

function pdfEscape(text: string): string {
  // Strip non-ASCII so the string's .length always matches its encoded byte
  // length - the PDF stream's /Length must be exact.
  const ascii = Array.from(text)
    .filter((ch) => ch.charCodeAt(0) < 128)
    .join("");
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const LINES_PER_PAGE = 54;

export function generateTextPdf(lines: string[]): Uint8Array {
  const pageLines: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pageLines.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (pageLines.length === 0) pageLines.push([]);

  const catalogNum = 1;
  const pagesNum = 2;
  const fontNum = 3;
  const pageObjNums = pageLines.map((_, i) => 4 + 2 * i);
  const contentObjNums = pageLines.map((_, i) => 5 + 2 * i);
  const totalObjects = 3 + pageLines.length * 2;

  const objects: string[] = [];
  objects[catalogNum] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objects[pagesNum] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageLines.length} >>`;
  objects[fontNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`;

  pageLines.forEach((linesOnPage, i) => {
    objects[pageObjNums[i]] =
      `<< /Type /Page /Parent ${pagesNum} 0 R /Resources << /Font << /F1 ${fontNum} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentObjNums[i]} 0 R >>`;

    let stream = "BT\n/F1 10 Tf\n50 750 Td\n13 TL\n";
    for (const line of linesOnPage) {
      stream += `(${pdfEscape(line)}) Tj\nT*\n`;
    }
    stream += "ET";
    objects[contentObjNums[i]] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  const encoder = new TextEncoder();
  let out: number[] = Array.from(encoder.encode("%PDF-1.4\n"));
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  for (let n = 1; n <= totalObjects; n++) {
    offsets[n] = out.length;
    out = out.concat(Array.from(encoder.encode(`${n} 0 obj\n${objects[n]}\nendobj\n`)));
  }

  const xrefOffset = out.length;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjects; n++) {
    xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${totalObjects + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  out = out.concat(Array.from(encoder.encode(xref)));

  return new Uint8Array(out);
}
