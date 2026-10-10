// Correos de acceso de Better Auth (verificación y "ya tienes una cuenta") y
// su límite por cuenta. Solo para el SERVIDOR: lo usa lib/auth.ts.
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { linkDurationText, VERIFY_CALLBACK_PATH } from "@/lib/verification";

// Límite por cuenta: como mucho 1 correo por minuto y 5 en 24 h.
// Lo que trae Better Auth (3 por minuto y por IP) solo cuenta las peticiones
// HTTP a /api/auth, en memoria de cada instancia, y nuestras Server Actions
// llaman a auth.api, que se lo salta. Este se guarda en la base.
const MIN_GAP = "1 minute";
const WINDOW = "24 hours";
const MAX_PER_WINDOW = 5;

// Reserva el envío de un correo a esta cuenta. Devuelve false si se ha
// pasado del límite, y entonces no se envía nada (sin avisar: la pantalla
// responde siempre igual, para no delatar qué correos existen).
// Una sola UPDATE condicional: si llegan dos a la vez, la segunda espera el
// bloqueo de la fila, vuelve a mirar el WHERE con los valores nuevos y no
// cambia nada. Las fechas van en UTC sin zona, como las guarda Prisma.
async function claimAuthEmail(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "User" SET
      "authEmailCount" = CASE
        WHEN "lastAuthEmailAt" IS NULL
          OR "lastAuthEmailAt" <= (now() AT TIME ZONE 'UTC') - ${WINDOW}::interval
        THEN 1
        ELSE "authEmailCount" + 1
      END,
      "lastAuthEmailAt" = now() AT TIME ZONE 'UTC'
    WHERE "id" = ${userId}
      AND ("lastAuthEmailAt" IS NULL
        OR "lastAuthEmailAt" <= (now() AT TIME ZONE 'UTC') - ${MIN_GAP}::interval)
      AND ("lastAuthEmailAt" IS NULL
        OR "lastAuthEmailAt" <= (now() AT TIME ZONE 'UTC') - ${WINDOW}::interval
        OR "authEmailCount" < ${MAX_PER_WINDOW})
    RETURNING "id"`;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
//  Plantilla común
// ---------------------------------------------------------------------------
// Los correos no pueden usar los tokens de app/globals.css: estos son los
// mismos colores, copiados. Si cambia la paleta, cambiar también aquí.
const C = {
  night: "#0a0d14",
  surface: "#171a24",
  line: "#38332b",
  gold: "#b89654",
  goldBright: "#d9b266",
  parchment: "#e0ded4",
  ash: "#b2b0ad",
  smoke: "#8c8c99",
};

// Lo que va dentro del HTML se escapa: nunca se pega texto sin más.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type Layout = {
  title: string;
  // Párrafos de texto (sin HTML).
  paragraphs: string[];
  button: { label: string; href: string };
  // Letra pequeña bajo el botón (sin HTML).
  footnotes: string[];
};

// Tablas y estilos en línea: es lo que entienden Gmail, Outlook y el móvil.
function renderHtml({ title, paragraphs, button, footnotes }: Layout): string {
  const href = escapeHtml(button.href);
  const p = (text: string, color: string, size: number) =>
    `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:${size}px;line-height:1.6;color:${color};">${escapeHtml(text)}</p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.night};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.night};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td align="center" style="padding:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:bold;letter-spacing:6px;color:${C.goldBright};">EMBER</td></tr>
<tr><td style="background-color:${C.surface};border:1px solid ${C.line};border-radius:8px;padding:28px 24px;">
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;font-weight:bold;color:${C.parchment};">${escapeHtml(title)}</h1>
${paragraphs.map((text) => p(text, C.ash, 15)).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td style="background-color:${C.gold};border-radius:6px;">
<a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:1px;color:${C.night};text-decoration:none;">${escapeHtml(button.label)}</a>
</td></tr>
</table>
${p("Si el botón no funciona, copia este enlace en el navegador:", C.smoke, 13)}
<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:${C.goldBright};">${href}</a></p>
${footnotes.map((text) => p(text, C.smoke, 13)).join("\n")}
</td></tr>
<tr><td align="center" style="padding:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${C.smoke};">La llama no debe extinguirse.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderText({ title, paragraphs, button, footnotes }: Layout): string {
  return [title, "", ...paragraphs, "", `${button.label}: ${button.href}`, "", ...footnotes, "", "— Ember"].join("\n");
}

// ---------------------------------------------------------------------------
//  Correos
// ---------------------------------------------------------------------------

// Correo de verificación. `url` es el que construye Better Auth a partir de
// BETTER_AUTH_URL (…/api/auth/verify-email?token=…&callbackURL=…). Aquí se
// fija el callbackURL, para que también valga cuando alguien llama a
// /api/auth directamente con otro (o sin ninguno).
export async function sendVerificationLink(user: { id: string; email: string }, url: string) {
  if (!(await claimAuthEmail(user.id))) return;

  const link = new URL(url);
  link.searchParams.set("callbackURL", VERIFY_CALLBACK_PATH);

  // Sin el nombre: lo escribe quien se registra, y este correo puede llegar
  // a un buzón ajeno. Así nadie mete su texto en un correo nuestro.
  const layout: Layout = {
    title: "Confirma tu correo",
    paragraphs: [
      "Estás a un paso de unirte a la guardia de Ember.",
      "Confirma que este correo es tuyo para encender tu llama y entrar en la mazmorra.",
    ],
    button: { label: "Confirmar mi correo", href: link.toString() },
    footnotes: [
      `El enlace dura ${linkDurationText()}. Si caduca, entra en Ember con tu correo y tu contraseña y te enviaremos otro.`,
      "Si no creaste una cuenta en Ember, ignora este correo: sin confirmar, nadie puede entrar con él.",
    ],
  };

  await sendEmail({
    to: user.email,
    subject: "Confirma tu correo para entrar en Ember",
    html: renderHtml(layout),
    text: renderText(layout),
  });
}

// Alguien intentó registrarse con el correo de una cuenta ya verificada.
// La pantalla de registro no lo dice (enumeración); se avisa al dueño.
export async function sendExistingAccountNotice(user: { id: string; email: string }, loginUrl: string) {
  if (!(await claimAuthEmail(user.id))) return;

  const layout: Layout = {
    title: "Ya tienes una cuenta en Ember",
    paragraphs: [
      "Alguien intentó crear una cuenta nueva con este correo, pero tu llama ya arde en Ember.",
      "Si fuiste tú, entra con tu correo y tu contraseña.",
    ],
    button: { label: "Entrar en Ember", href: loginUrl },
    footnotes: ["Si no fuiste tú, no tienes que hacer nada: tu cuenta sigue igual."],
  };

  await sendEmail({
    to: user.email,
    subject: "Ya tienes una cuenta en Ember",
    html: renderHtml(layout),
    text: renderText(layout),
  });
}
