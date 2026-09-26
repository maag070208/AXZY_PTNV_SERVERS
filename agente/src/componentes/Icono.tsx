import type { ReactNode } from "react";

// Icono dentro de un circulo con el color del tema (primary, success, danger...).
export default function Icono({ color, tamano = "grande", children }: { color: string; tamano?: "grande" | "chico"; children: ReactNode }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${tamano === "chico" ? "h-12 w-12 text-2xl" : "h-20 w-20 text-4xl"}`}
      style={{ backgroundColor: `var(--color-${color}-100)`, color: `var(--color-${color}-600)` }}
    >
      {children}
    </span>
  );
}
