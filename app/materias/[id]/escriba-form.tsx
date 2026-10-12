"use client";

import { useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { invocarEscriba, type ResultadoEscriba } from "./actions";
import { useEscriba } from "./escriba-context";
import { buttonStyles } from "@/components/ui/button";
import { cardStyles } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { labelStyles, textareaStyles } from "@/components/ui/text-field";
import { AGENT, AGENT_ERRORS, formatFileSize, normalizarApuntes } from "@/lib/agent/rules";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/text";

type Props = {
  subjectId: string;
  // Invocaciones que le quedan hoy. La calcula el servidor; después de una
  // invocación con éxito la página se vuelve a pintar con la nueva.
  remaining: number;
};

type Mode = "TEXT" | "PDF";

const MODES: { value: Mode; label: string }[] = [
  { value: "TEXT", label: "Pegar texto" },
  { value: "PDF", label: "Subir PDF" },
];

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

// La tarjeta "Generar con tus apuntes" (Figma 107:54 y sus estados en 111:2).
//
// Los apuntes y el PDF viven en el estado de React, no en el <form>: el envío
// arma la FormData a mano y llama a la acción dentro de una transición. Así
// React no vacía el formulario al terminar y, si hay error, los apuntes y el
// PDF siguen aquí. Con éxito se vacían.
export function EscribaForm({ subjectId, remaining }: Props) {
  const { setWritten } = useEscriba();
  const [mode, setMode] = useState<Mode>("TEXT");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  // El último error (null si no hay). limit: el del límite diario.
  const [error, setError] = useState<{ message: string; limit: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contados como los cuenta el servidor (los saltos de línea, uno).
  const chars = normalizarApuntes(notes).length;
  const exhausted = remaining <= 0 || error?.limit === true;

  // Un PDF elegido o soltado. Se comprueba aquí lo que se puede (tamaño y
  // tipo) para no subir 4 MB para nada; lo que cuenta es lo que diga el
  // servidor, que además cuenta las páginas.
  function chooseFile(chosen: File | undefined) {
    if (!chosen) return;
    if (chosen.type !== "application/pdf") {
      setError({ message: AGENT_ERRORS.pdfNotPdf, limit: false });
      return;
    }
    if (chosen.size > AGENT.maxPdfBytes) {
      setError({ message: AGENT_ERRORS.pdfTooBig, limit: false });
      return;
    }
    setError(null);
    setFile(chosen);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!pending) chooseFile(event.dataTransfer.files[0]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Ya hay una invocación en camino, o no quedan: un segundo clic no hace nada.
    if (pending || exhausted) return;

    if (mode === "TEXT" && normalizarApuntes(notes).trim() === "") {
      setError({ message: AGENT_ERRORS.emptyText, limit: false });
      return;
    }
    if (mode === "PDF" && !file) {
      setError({ message: AGENT_ERRORS.noPdf, limit: false });
      return;
    }

    const formData = new FormData();
    formData.set("subjectId", subjectId);
    formData.set("kind", mode);
    if (mode === "TEXT") formData.set("notes", notes);
    else if (file) formData.set("pdf", file);

    setError(null);
    startTransition(async () => {
      let result: ResultadoEscriba;
      try {
        result = await invocarEscriba(formData);
      } catch {
        // La petición no llegó a responder (la red, o el servidor la
        // rechazó por tamaño). Nada se ha guardado ni contado.
        result = { ok: false, error: AGENT_ERRORS.noResponse, limit: false };
      }
      if (!result.ok) {
        setError({ message: result.error, limit: result.limit });
        return;
      }
      setNotes("");
      setFile(null);
      setWritten({ count: result.created });
    });
  }

  return (
    <section aria-labelledby="escriba" className={cn(cardStyles, "flex flex-col gap-4.5 p-5 md:p-6")}>
      <Eyebrow id="escriba" className="tracking-[2px]">
        Generar con tus apuntes
      </Eyebrow>
      <p className="text-sm leading-[normal] text-ash">
        El escriba lee tus apuntes, decide cuántas preguntas salen de ellos y las sella: solo las
        conocerás cuando un jefe te las lance.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4.5" aria-busy={pending || undefined}>
        {/* Modo: dos radios con aspecto de pestañas, como el tipo de pregunta
            del formulario manual. */}
        <fieldset className="min-w-0" disabled={pending}>
          <legend className="sr-only">Cómo le das tus apuntes al escriba</legend>
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line">
            {MODES.map(({ value, label }) => (
              <label
                key={value}
                className="relative flex min-h-11 items-center justify-center px-2 py-2.5 text-center text-sm leading-tight text-ash transition-colors has-checked:bg-gold/16 has-checked:font-semibold has-checked:text-gold-bright"
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    setError((current) => (current?.limit ? current : null));
                  }}
                  className="absolute inset-0 cursor-pointer appearance-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-bright"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "TEXT" ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="apuntes" className={labelStyles}>
              Tus apuntes
            </label>
            {/* readOnly mientras el escriba lee: lo que se ve es lo que se
                envió. */}
            <textarea
              id="apuntes"
              rows={9}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              readOnly={pending}
              maxLength={AGENT.maxTextChars}
              aria-describedby="apuntes-contador"
              className={cn(textareaStyles, "min-h-40 text-sm")}
            />
            <p id="apuntes-contador" className="text-right text-xs leading-[normal] text-smoke">
              {formatNumber(chars)} / {formatNumber(AGENT.maxTextChars)} caracteres
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p id="pdf-etiqueta" className={labelStyles}>
              Tu PDF
            </p>
            {/* La zona entera es la etiqueta del <input type="file">: se
                pulsa para elegir, o se suelta encima un PDF. El input va
                oculto (sr-only) pero sigue siendo el control: el teclado llega
                a él y el contorno de foco se pinta en la zona. */}
            <label
              onDragOver={(event) => {
                event.preventDefault();
                if (!pending) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed bg-night px-4 py-7 text-center leading-[normal] transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-bright",
                dragging ? "border-gold-bright" : "border-line hover:border-gold",
                pending && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                disabled={pending}
                aria-labelledby="pdf-etiqueta pdf-instrucciones"
                onChange={(event) => {
                  chooseFile(event.target.files?.[0]);
                  // Vacío: así se puede volver a elegir el mismo archivo
                  // después de quitarlo.
                  event.target.value = "";
                }}
                className="sr-only"
              />
              <span id="pdf-instrucciones" className="text-sm font-semibold text-parchment">
                Arrastra tu PDF aquí o pulsa para elegirlo
              </span>
              <span className="text-xs text-smoke">
                Máximo 4 MB y {AGENT.maxPdfPages} páginas. No se guarda en Ember.
              </span>
            </label>

            {file && (
              <div className="flex items-center gap-3 rounded-lg border border-gold/50 bg-gold/8 px-3.5 py-3 leading-[normal]">
                <p className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold wrap-anywhere text-parchment">{file.name}</span>
                  <span className="text-xs text-ash">{formatFileSize(file.size)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    // El foco vuelve a la zona para elegir otro.
                    fileInputRef.current?.focus();
                  }}
                  disabled={pending}
                  aria-label={`Quitar ${file.name}`}
                  className={cn(
                    "-my-2.5 inline-flex h-11 shrink-0 cursor-pointer items-center rounded-sm px-2 text-[13px] font-semibold text-gold-bright transition-colors hover:text-parchment disabled:cursor-not-allowed disabled:opacity-60",
                    FOCUS_RING,
                  )}
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        )}

        {/* Siempre visible: antes de invocar hay que saber adónde van los
            apuntes. */}
        <div className="flex flex-col gap-1 rounded-lg border border-ember/45 bg-ember/8 px-3.5 py-3 leading-[normal]">
          <p className="text-[11px] font-semibold tracking-[1px] text-ember uppercase">Antes de invocar</p>
          <p className="text-[13px] text-parchment">
            Tus apuntes se envían a Google Gemini para escribir las preguntas. Ember no los guarda. No
            pegues datos personales.
          </p>
        </div>

        {exhausted ? (
          <div className="flex flex-col gap-1 rounded-lg border border-smoke/55 bg-smoke/12 px-3.5 py-3 leading-[normal]">
            <p className="text-sm font-semibold text-parchment">El escriba descansa</p>
            <p className="text-[13px] text-ash">{AGENT_ERRORS.limit}</p>
          </div>
        ) : (
          error &&
          !pending && (
            // role="alert": el lector de pantalla lo lee en cuanto aparece.
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-lg border border-blood bg-blood/16 px-3.5 py-3 leading-[normal]"
            >
              <p className="text-sm font-semibold text-parchment">El escriba no ha podido escribir</p>
              <p className="text-[13px] wrap-anywhere text-ash">{error.message}</p>
            </div>
          )
        )}

        <div className="flex flex-col gap-3">
          {/* aria-disabled y no disabled mientras lee: un botón con el foco
              que pasa a disabled lo pierde. Sin invocaciones, sí disabled. */}
          <button
            type="submit"
            disabled={exhausted}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className={cn(
              buttonStyles({ size: "md" }),
              "w-full cursor-pointer tracking-[1px] aria-disabled:cursor-wait aria-disabled:opacity-55 disabled:opacity-40",
            )}
          >
            {pending ? "El escriba está leyendo…" : "Invocar al escriba"}
          </button>
          <p role="status" className="text-center text-xs leading-[normal] text-smoke">
            {pending
              ? "Puede tardar unos segundos. No cierres la página."
              : `Te quedan ${exhausted ? 0 : remaining} de ${AGENT.dailyInvocations} invocaciones hoy`}
          </p>
        </div>
      </form>
    </section>
  );
}
