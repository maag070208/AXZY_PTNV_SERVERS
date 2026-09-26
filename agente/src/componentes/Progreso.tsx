import { ITAlert, ITLoader, ITProgress, ITText } from "@axzydev/axzy_ui_system";
import { useEffect, useRef, useState } from "react";
import { FaChevronDown, FaChevronUp, FaCircleCheck, FaCircleXmark } from "react-icons/fa6";
import type { Tarea } from "../useTarea";
import Icono from "./Icono";

interface Props {
  tarea: Tarea;
  titulos: { corriendo: string; ok: string; error: string };
  descripcionOk?: string;
}

// Avance de la tarea en curso: titulo, barra, pasos, errores y la salida completa.
export default function Progreso({ tarea, titulos, descripcionOk }: Props) {
  const { fase, pasos, total, actual, avance, avisos, error } = tarea;
  if (fase === "libre") return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {fase === "corriendo" && <ITLoader size="md" />}
        {fase === "ok" && (
          <Icono color="success" tamano="chico">
            <FaCircleCheck />
          </Icono>
        )}
        {fase === "error" && (
          <Icono color="danger" tamano="chico">
            <FaCircleXmark />
          </Icono>
        )}
        <div className="flex-1">
          <ITText as="h2" className="text-lg font-semibold">
            {titulos[fase]}
          </ITText>
          <ITText muted className="text-sm">
            {fase === "corriendo" && (actual ? `Paso ${actual.n} de ${total} · ${actual.titulo}` : "Preparando…")}
            {fase === "ok" && (descripcionOk ?? "Terminó sin errores.")}
            {fase === "error" && "Revisa el mensaje de abajo."}
          </ITText>
        </div>
      </div>

      <ITProgress value={avance} size="md" color={fase === "error" ? "danger" : fase === "ok" ? "success" : "primary"} />

      {pasos.length > 0 && (
        <ol className="flex flex-col gap-2">
          {pasos.map((paso) => {
            const esActual = paso === actual && fase !== "ok";
            return (
              <li key={paso.n} className="flex items-center gap-3">
                <span className="flex w-5 justify-center">
                  {!esActual && <FaCircleCheck style={{ color: "var(--color-success-600)" }} />}
                  {esActual && fase === "corriendo" && <ITLoader size="sm" />}
                  {esActual && fase === "error" && <FaCircleXmark style={{ color: "var(--color-danger-500)" }} />}
                </span>
                <ITText as="span" className={esActual ? "text-sm font-semibold" : "text-sm"} muted={!esActual}>
                  {paso.titulo}
                </ITText>
              </li>
            );
          })}
        </ol>
      )}

      {error && fase === "error" && (
        <ITAlert variant="error" title="Error">
          {error}
        </ITAlert>
      )}
      {avisos.map((aviso) => (
        <ITAlert key={aviso} variant="warning" title="Aviso">
          {aviso}
        </ITAlert>
      ))}

      <Detalle lineas={tarea.lineas} abrirSolo={fase === "error"} />
    </div>
  );
}

function Detalle({ lineas, abrirSolo }: { lineas: string[]; abrirSolo: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const consola = useRef<HTMLPreElement>(null);
  const visible = abierto || abrirSolo;

  useEffect(() => {
    consola.current?.scrollTo({ top: consola.current.scrollHeight });
  }, [lineas, visible]);

  if (!lineas.length) return null;
  return (
    <div className="rounded-lg border border-slate-200">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2" onClick={() => setAbierto(!visible)} aria-expanded={visible}>
        <ITText as="span" className="text-sm font-semibold">
          Detalle técnico
        </ITText>
        {visible ? <FaChevronUp /> : <FaChevronDown />}
      </button>
      {visible && (
        <pre ref={consola} className="m-0 max-h-64 overflow-auto rounded-b-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
          {lineas.join("\n")}
        </pre>
      )}
    </div>
  );
}
