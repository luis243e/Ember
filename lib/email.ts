// Envío de correos para el SERVIDOR. Todo correo de Ember sale por
// sendEmail(): para cambiar de Gmail a otro proveedor (Resend con dominio
// propio) solo hay que tocar este archivo.
import { createTransport, type Transporter } from "nodemailer";

export type Email = {
  to: string;
  subject: string;
  // HTML con estilos en línea (los clientes de correo ignoran <style>).
  html: string;
  // Versión en texto plano: la leen los clientes sin HTML y los filtros de
  // spam la esperan.
  text: string;
};

// Se crea una sola vez por instancia del servidor y se reutiliza.
let transporter: Transporter | null = null;

function gmailTransporter(user: string, pass: string): Transporter {
  transporter ??= createTransport({
    // SMTP de Gmail por el puerto 587: empieza sin cifrar y pasa a TLS con
    // STARTTLS. requireTLS: si el servidor no ofrece TLS, no se envía nada.
    // Se usa el 587 y no el 465 (TLS desde el principio) porque el antivirus
    // de un equipo de desarrollo (Norton) intercepta el 465 con un
    // certificado que Node rechaza; ver docs/README.md.
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    // GMAIL_APP_PASSWORD es una contraseña de aplicación de Google, no la de
    // la cuenta. Nunca se imprime ni se registra.
    auth: { user, pass },
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, text }: Email): Promise<void> {
  const user = process.env.GMAIL_USER;
  // Google muestra la contraseña de aplicación en 4 grupos con espacios: se
  // quitan, por si se pegó tal cual.
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

  if (!user || !pass) {
    // En producción, sin credenciales no se puede enviar nada: falla. El
    // mensaje no lleva el correo ni el enlace: los enlaces son llaves (abren
    // una sesión o cambian la contraseña) y los logs de Vercel no deben
    // guardarlas. VERCEL lo pone Vercel en todos sus despliegues, también en
    // los de vista previa: allí tampoco se imprime nunca.
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      throw new Error("Faltan GMAIL_USER o GMAIL_APP_PASSWORD: no se puede enviar el correo.");
    }
    // Solo en desarrollo: el texto (con el enlace) va a la consola del
    // servidor de este equipo.
    console.info(`\n[correo de desarrollo] Para: ${to}\nAsunto: ${subject}\n\n${text}\n`);
    return;
  }

  await gmailTransporter(user, pass).sendMail({
    from: { name: "Ember", address: user },
    to,
    subject,
    html,
    text,
  });
}
