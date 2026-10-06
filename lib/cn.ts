// Une clases de Tailwind y descarta las vacías: cn("a", activo && "b").
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
