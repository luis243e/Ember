// Comprobación del PDF que se le da al escriba: tamaño, tipo, cabecera y
// número de páginas. SOLO del servidor (usa node:zlib). El PDF solo vive en
// memoria durante la petición: aquí se lee, nunca se escribe en ningún sitio.
//
// Contar páginas SIN dependencias: un PDF es texto con trozos binarios. El
// árbol de páginas lo encabeza un diccionario "<< /Type /Pages /Count 12 ...
// >>"; su /Count es el total. Desde PDF 1.5 esos diccionarios pueden ir dentro
// de "streams de objetos" (/Type /ObjStm) comprimidos con zlib: se
// descomprimen y se busca también dentro. Si aun así no aparece ningún
// /Count, se cuentan las hojas (/Type /Page). Es una heurística: un PDF
// cifrado o muy raro puede no contarse, y entonces se rechaza como ilegible.
import { inflateSync } from "node:zlib";
import { AGENT, AGENT_ERRORS } from "@/lib/agent/rules";

// Límites contra las "bombas de descompresión": un stream de pocos KB que, al
// descomprimirse, ocupa gigas. Si se pasa cualquiera, el PDF es ilegible.
export const PDF_INFLATE_LIMITS = {
  // Lo que puede ocupar UN stream descomprimido. inflateSync se detiene al
  // llegar (maxOutputLength) en vez de seguir reservando memoria.
  perStreamBytes: 8 * 1024 * 1024,
  // Lo que pueden ocupar TODOS los streams descomprimidos de un PDF.
  totalBytes: 32 * 1024 * 1024,
  // Cuántos streams de objetos se intentan como mucho.
  maxStreams: 200,
} as const;

// Un PDF con algo raro que impide leerlo (por ejemplo, una bomba).
class PdfIlegible extends Error {}

// Lo que se puede mirar sin tocar la base: el tamaño y el tipo que declara el
// navegador, y los primeros bytes. pages = páginas contadas.
export type PdfCheck = { ok: true; pages: number } | { ok: false; error: string };

export function comprobarPdf(file: { size: number; type: string }, bytes: Buffer): PdfCheck {
  if (file.size > AGENT.maxPdfBytes || bytes.length > AGENT.maxPdfBytes) {
    return { ok: false, error: AGENT_ERRORS.pdfTooBig };
  }
  if (file.type !== "application/pdf") return { ok: false, error: AGENT_ERRORS.pdfNotPdf };
  // El tipo lo declara el navegador y se puede falsear: los PDF de verdad
  // empiezan por "%PDF-".
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, error: AGENT_ERRORS.pdfNotPdf };
  }
  const pages = contarPaginasPdf(bytes);
  if (pages === null) return { ok: false, error: AGENT_ERRORS.pdfUnreadable };
  if (pages > AGENT.maxPdfPages) return { ok: false, error: AGENT_ERRORS.pdfTooManyPages };
  return { ok: true, pages };
}

// Páginas del PDF, o null si no se han podido contar (o se pasó algún límite
// de descompresión).
export function contarPaginasPdf(bytes: Buffer): number | null {
  try {
    // latin1: cada byte es un carácter, así los índices del texto son los de
    // los bytes y los trozos binarios no rompen nada.
    const raw = bytes.toString("latin1");
    const textos = [raw, ...streamsDeObjetos(raw, bytes)];

    // El /Count mayor de los diccionarios /Pages es el de la raíz.
    let maxCount = 0;
    let hojas = 0;
    for (const texto of textos) {
      maxCount = Math.max(maxCount, mayorCountDePages(texto));
      hojas += (texto.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
    }
    if (maxCount > 0) return maxCount;
    return hojas > 0 ? hojas : null;
  } catch (error) {
    if (error instanceof PdfIlegible) return null;
    throw error;
  }
}

// El /Count más alto entre los diccionarios con /Type /Pages.
function mayorCountDePages(texto: string): number {
  let max = 0;
  for (const match of texto.matchAll(/\/Type\s*\/Pages(?![A-Za-z])/g)) {
    const dict = diccionarioQueContiene(texto, match.index);
    if (!dict) continue;
    const count = /\/Count\s+(\d{1,6})(?!\d)/.exec(texto.slice(dict.start, dict.end));
    if (count) max = Math.max(max, Number(count[1]));
  }
  return max;
}

// Hasta dónde se busca el principio o el final de un diccionario: así un PDF
// fabricado no puede hacer que la búsqueda recorra el archivo entero una y
// otra vez.
const DICT_SCAN_LIMIT = 64 * 1024;

// Límites [start, end) del diccionario "<< ... >>" que contiene la posición
// `at`, contando los diccionarios anidados, o null si no se encuentra cerca.
function diccionarioQueContiene(texto: string, at: number): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  for (let i = at - 1; i > 0 && at - i < DICT_SCAN_LIMIT; i--) {
    const pair = texto.slice(i - 1, i + 1);
    if (pair === ">>") {
      depth++;
      i--;
    } else if (pair === "<<") {
      if (depth === 0) {
        start = i - 1;
        break;
      }
      depth--;
      i--;
    }
  }
  if (start === -1) return null;

  depth = 0;
  for (let i = start + 2; i < texto.length - 1 && i - start < DICT_SCAN_LIMIT; i++) {
    const pair = texto.slice(i, i + 2);
    if (pair === "<<") {
      depth++;
      i++;
    } else if (pair === ">>") {
      if (depth === 0) return { start, end: i + 2 };
      depth--;
      i++;
    }
  }
  return null;
}

// El contenido descomprimido de cada stream de objetos (/Type /ObjStm) con
// /FlateDecode, como texto latin1. Solo esos: los streams de las páginas
// (dibujo, imágenes) no hacen falta para contar y no se tocan.
function streamsDeObjetos(raw: string, bytes: Buffer): string[] {
  const textos: string[] = [];
  let intentos = 0;
  let total = 0;

  for (const match of raw.matchAll(/\/Type\s*\/ObjStm(?![A-Za-z])/g)) {
    intentos++;
    if (intentos > PDF_INFLATE_LIMITS.maxStreams) throw new PdfIlegible();

    const dict = diccionarioQueContiene(raw, match.index);
    if (!dict) continue;
    const dictText = raw.slice(dict.start, dict.end);
    if (!/\/Filter\s*\/FlateDecode(?![A-Za-z])/.test(dictText)) continue;

    // Tras el diccionario viene "stream" y un salto de línea (\r\n o \n).
    const header = /^\s*stream\r?\n/.exec(raw.slice(dict.end, dict.end + 32));
    if (!header) continue;
    const dataStart = dict.end + header[0].length;
    // /Length directo si lo hay; si es una referencia ("12 0 R") o falta, se
    // corta en "endstream".
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dictText);
    const dataEnd = length
      ? Math.min(dataStart + Number(length[1]), bytes.length)
      : raw.indexOf("endstream", dataStart);
    if (dataEnd <= dataStart) continue;

    let inflated: Buffer;
    try {
      inflated = inflateSync(bytes.subarray(dataStart, dataEnd), {
        maxOutputLength: PDF_INFLATE_LIMITS.perStreamBytes,
      });
    } catch (error) {
      // Se pasó del tope de un stream (RangeError): bomba, o casi.
      if (error instanceof RangeError) throw new PdfIlegible();
      // Datos rotos o cifrados: ese stream no se puede leer; se sigue con
      // los demás.
      continue;
    }
    total += inflated.length;
    if (total > PDF_INFLATE_LIMITS.totalBytes) throw new PdfIlegible();
    textos.push(inflated.toString("latin1"));
  }
  return textos;
}
