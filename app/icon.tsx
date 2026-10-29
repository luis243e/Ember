import { ImageResponse } from "next/og";
import { PixelFlame } from "@/components/ui/pixel-flame";

// Icono de la pestaña: la llama de píxeles a 32 × 32 (2 px por píxel), sobre
// fondo transparente para que ocupe todo el icono. Next lo genera al compilar
// y añade el <link rel="icon"> solo.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <PixelFlame pixel={2} />
      </div>
    ),
    size,
  );
}
