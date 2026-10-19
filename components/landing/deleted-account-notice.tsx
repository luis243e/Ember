"use client";

import { Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";

// El aviso de la landing después de borrar la cuenta (/?aviso=cuenta-borrada,
// desde app/perfil/actions.ts). Es una isla de cliente para que la landing
// siga siendo estática: leer searchParams en la página la volvería dinámica.
// Va dentro de un <Suspense> (useSearchParams lo exige en una página
// estática): en el HTML del servidor no sale nada, y aparece al hidratar.
// De la URL solo se compara la clave: el texto vive aquí.
export function DeletedAccountNotice({ className }: { className?: string }) {
  const show = useSearchParams().get("aviso") === "cuenta-borrada";
  // Se llega desde /perfil, con la página desplazada: el aviso quedaría
  // bajo la cabecera fija. Se vuelve arriba para que se vea.
  useEffect(() => {
    if (show) window.scrollTo({ top: 0 });
  }, [show]);
  if (!show) return null;
  return (
    <div className={className}>
      <Alert tone="info" icon={Trash2} className="mx-auto max-w-[1240px]">
        Tu cuenta y todos tus datos se han borrado. Gracias por velar con nosotros.
      </Alert>
    </div>
  );
}
