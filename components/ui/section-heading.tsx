import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "./eyebrow";

type SectionHeadingProps = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  // md = encabezado de sección; lg = llamada final, con título más grande.
  size?: "md" | "lg";
};

// Etiqueta superior, título (h2) y subtítulo opcional, centrados.
export function SectionHeading({ eyebrow, title, description, size = "md" }: SectionHeadingProps) {
  const large = size === "lg";

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          "font-display font-bold",
          large
            ? "max-w-[820px] text-[32px] leading-[1.15] md:text-[48px]"
            : "max-w-[760px] text-[28px] leading-[1.2] md:text-[40px]",
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "leading-[1.5] text-ash",
            large ? "max-w-[640px] text-[18px]" : "max-w-[620px] text-[17px]",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
