import { Notice } from "@/components/app/notice";

// Avisos de la llama. AppShell pone los dos primeros debajo de la cabecera,
// según flameState(); el tercero sale en la batalla, justo después del golpe.

// "La llama se ha extinguido": apagada pero había racha (extinguished).
// Desaparece solo al volver a golpear, porque la racha pasa a 1.
export function ExtinguishedFlameNotice() {
  return (
    <Notice title="La llama se ha extinguido.">Golpea hoy para volver a encenderla.</Notice>
  );
}

// La llama está protegida (status "protected"): hubo días sin golpear, pero
// las brasas los cubren. embersToSpend = días perdidos = brasas que se
// gastarán al golpear hoy (1 o 2).
export function ProtectedFlameNotice({ embersToSpend }: { embersToSpend: number }) {
  const one = embersToSpend === 1;
  return (
    <Notice tone="ember" title={one ? "Una brasa protege tu llama." : "Dos brasas protegen tu llama."}>
      {one
        ? "Ayer no estudiaste. Golpea hoy: se consumirá 1 brasa y tu llama seguirá encendida."
        : `Llevas ${embersToSpend} días sin estudiar. Golpea hoy: se consumirán ${embersToSpend} brasas y tu llama seguirá encendida.`}
    </Notice>
  );
}

// Después de un golpe que gastó brasas para salvar la llama. Solo lo enseña
// la batalla: una vez escrito el golpe, el estado de la llama ya no recuerda
// que se gastó una (no hay columna para eso).
export function EmberSavedNotice({ spent, left }: { spent: number; left: number }) {
  const [title, rest] = emberSavedText(spent, left);
  return (
    <Notice tone="ember" title={title}>
      {rest}
    </Notice>
  );
}

// Las dos frases del aviso. La batalla las usa también para el anuncio del
// lector de pantalla, así que el texto vive en un solo sitio.
export function emberSavedText(spent: number, left: number): [title: string, rest: string] {
  return [
    spent === 1
      ? "Una brasa ha mantenido tu llama encendida."
      : "Dos brasas han mantenido tu llama encendida.",
    left === 0 ? "No te quedan brasas." : left === 1 ? "Te queda 1." : `Te quedan ${left}.`,
  ];
}
