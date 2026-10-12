import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El escriba recibe el PDF por una Server Action (FormData con el File).
      // Por defecto Next corta el cuerpo de una acción en 1 MB. El PDF puede
      // pesar 4 MB (AGENT.maxPdfBytes) y el límite cuenta el cuerpo HTTP
      // entero, separadores del multipart incluidos (unos KB más). 4,5 MB es
      // además el máximo que acepta una función de Vercel (413
      // FUNCTION_PAYLOAD_TOO_LARGE): subirlo más no serviría de nada.
      // Ver node_modules/next/dist/docs/01-app/03-api-reference/05-config/
      // 01-next-config-js/serverActions.md.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
