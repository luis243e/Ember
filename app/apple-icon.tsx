import { ImageResponse } from "next/og";
import { PixelFlame } from "@/components/ui/pixel-flame";

// Icono de la pantalla de inicio en iPhone/iPad. iOS no admite transparencia
// (la rellena de negro), así que va sobre el fondo night de la app: la llama
// mide 160 px (10 px por píxel) y queda centrada con 10 px de margen.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0d14",
        }}
      >
        <PixelFlame pixel={10} />
      </div>
    ),
    size,
  );
}
