// Llama de Ember hecha de píxeles: una cuadrícula de 16 × 16 cuadraditos de
// CSS. La usan app/icon.tsx (la pestaña) y app/apple-icon.tsx (la pantalla de
// inicio del móvil), que la pasan por ImageResponse. ImageResponse no entiende
// grid, así que cada fila es un flex con sus 16 píxeles.

// Cada letra es un color de la paleta de globals.css; el punto es vacío.
// R = borde (blood), O = cuerpo (ember), Y = interior (gold-bright),
// W = el corazón, más claro que cualquier token para que la llama brille.
const COLORS: Record<string, string> = {
  R: "#9e2929",
  O: "#e58c40",
  Y: "#d9b266",
  W: "#f6ead0",
};

const ROWS = [
  "........R.......",
  ".......RR.......",
  ".......RRR......",
  "......RROR....R.",
  "..R...ROOR...RR.",
  "..RR.RROOOR.RRR.",
  "..RRRROOYOORROR.",
  ".RROOOOYYOOOOOR.",
  ".ROOOYYYYYOOOOR.",
  ".ROOYYYWWYYYOOR.",
  ".ROOYYWWWWYYOOR.",
  ".RROYYWWWWYYORR.",
  "..RROYYWWYYORR..",
  "...RROOYYOORR...",
  ".....RRRRRR.....",
  "................",
];

// pixel = lado de cada cuadradito en px; la llama mide 16 × pixel.
export function PixelFlame({ pixel }: { pixel: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {ROWS.map((row, y) => (
        <div key={y} style={{ display: "flex" }}>
          {[...row].map((cell, x) => (
            <div
              key={x}
              style={{
                width: pixel,
                height: pixel,
                background: COLORS[cell] ?? "transparent",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
