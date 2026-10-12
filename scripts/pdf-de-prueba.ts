// PDFs fabricados a mano para las pruebas del escriba (scripts/probar-escriba.ts
// y scripts/probar-gemini.ts). Sin dependencias: un PDF es texto con trozos
// binarios, y para estas pruebas basta con escribirlo a mano.
import { deflateSync } from "node:zlib";

const latin1 = (text: string) => Buffer.from(text, "latin1");

// Un PDF clásico (sin streams de objetos) con `pages` páginas en blanco: el
// diccionario /Pages lleva /Count y cada hoja su /Type /Page.
export function pdfSimple(pages: number): Buffer {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ");
  let body = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  body += `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages} >>\nendobj\n`;
  for (let i = 0; i < pages; i++) {
    body += `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;
  }
  return latin1(`${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`);
}

// Un stream de objetos (/Type /ObjStm) comprimido con /FlateDecode.
function objStm(id: number, data: Buffer): Buffer {
  return Buffer.concat([
    latin1(`${id} 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length ${data.length} /Filter /FlateDecode >>\nstream\n`),
    data,
    latin1("\nendstream\nendobj\n"),
  ]);
}

// PDF 1.5 con el árbol de páginas DENTRO de un stream de objetos comprimido:
// en el texto del archivo no aparece ningún /Type /Pages.
export function pdfConObjStm(pages: number): Buffer {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 10} 0 R`).join(" ");
  let inner = `2 0 << /Type /Pages /Kids [${kids}] /Count ${pages} >>\n`;
  for (let i = 0; i < pages; i++) inner += `<< /Type /Page /Parent 2 0 R >>\n`;
  return Buffer.concat([
    latin1("%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    objStm(5, deflateSync(latin1(inner))),
    latin1("trailer\n<< /Root 1 0 R >>\n%%EOF\n"),
  ]);
}

// Solo hojas (/Type /Page), sin ningún /Count: se cuentan las hojas.
export function pdfSoloHojas(pages: number): Buffer {
  let body = "%PDF-1.4\n";
  for (let i = 0; i < pages; i++) body += `${i + 1} 0 obj\n<< /Type /Page >>\nendobj\n`;
  return latin1(`${body}%%EOF\n`);
}

// Una "bomba": un stream de objetos de pocos KB que, al descomprimirse,
// ocuparía `inflatedBytes`. comprimido: el stream ya hecho, para reutilizarlo.
export function streamBomba(inflatedBytes: number): Buffer {
  return deflateSync(Buffer.alloc(inflatedBytes));
}

// PDF con `count` streams de objetos, todos con el mismo contenido comprimido.
export function pdfConStreams(compressed: Buffer, count: number): Buffer {
  const parts: Buffer[] = [latin1("%PDF-1.5\n")];
  for (let i = 0; i < count; i++) parts.push(objStm(i + 1, compressed));
  parts.push(latin1("%%EOF\n"));
  return Buffer.concat(parts);
}

// Un PDF VÁLIDO de una página con texto (Helvetica), con su tabla xref bien
// calculada: lo puede abrir cualquier lector, también Gemini. Solo ASCII y
// latin1 sencillo: los paréntesis y las barras se escapan.
export function pdfConTexto(lines: string[]): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = [
    "BT",
    "/F1 12 Tf",
    "14 TL",
    "72 740 Td",
    ...lines.map((line) => `(${escape(line)}) Tj T*`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(latin1(pdf).length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = latin1(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(pdf);
}
