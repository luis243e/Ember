import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { linkDurationText, RESET_LINK_SECONDS } from "@/lib/verification";

// El enlace no sirve: no existe, está cortado, ya se usó o caducó. No se
// distingue cuál de las cuatro (Better Auth tampoco lo dice).
export function EnlaceInvalido() {
  return (
    <div className="flex flex-col gap-5">
      <Alert>
        El enlace no es válido o ha caducado. Cada enlace sirve una sola vez y dura{" "}
        {linkDurationText(RESET_LINK_SECONDS)}: pide otro.
      </Alert>
      <ButtonLink href="/olvide-contrasena" className="w-full">
        Pedir otro enlace
      </ButtonLink>
    </div>
  );
}
