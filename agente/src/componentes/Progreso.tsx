import { ITAlert, ITButton, ITText } from "@axzydev/axzy_ui_system";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FaCheck, FaChevronDown, FaChevronUp, FaRegClock, FaSpinner, FaTerminal, FaXmark } from "react-icons/fa6";
import type { Fase, Paso, Tarea } from "../useTarea";

interface Props {
  tarea: Tarea;
  titulos: { corriendo: string; ok: string; error: string };
  descripcionOk?: string;
  /** Botones que van al pie (reintentar, soporte…), solo al terminar. */
  acciones?: ReactNode;
  /** Con esto aparece la X (y el botón «Cerrar») para quitar la tarjeta. */
  onCerrar?: () => void;
}

// Color del tema segun como vaya la tarea.
const COLOR: Record<Exclude<Fase, "libre">, string> = { corriendo: "primary", ok: "success", error: "danger" };

// Avance de la tarea en curso: tarjeta con medallón, barra, pasos, avisos y la salida completa.
export default function Progreso({ tarea, titulos, descripcionOk, acciones, onCerrar }: Props) {
  const { fase, pasos, total, actual, avance, avisos, error, inicio, fin } = tarea;
  if (fase === "libre") return null;

  const color = COLOR[fase];
  const corriendo = fase === "corriendo";
  const porcentaje = Math.round(avance);
  const termino = !corriendo;

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: `var(--color-${color}-200)` }}>
      {/* Encabezado con el degradado del estado: medallón, título, tiempo y avance. */}
      <div
        className="px-5 pb-4 pt-5"
        style={{ background: `linear-gradient(135deg, var(--color-${color}-100) 0%, var(--color-${color}-50) 40%, #ffffff 100%)` }}
      >
        <div className="flex items-start gap-4">
          <Medallon color={color} fase={fase} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ITText as="h2" className="text-lg font-semibold">
                {titulos[fase]}
              </ITText>
              <Duracion desde={inicio} hasta={fin} />
            </div>
            <ITText muted className="text-sm">
              {corriendo && (actual ? `Paso ${actual.n} de ${total} · ${actual.titulo}` : "Preparando…")}
              {fase === "ok" && (descripcionOk ?? "Terminó sin errores.")}
              {fase === "error" && "Revisa el detalle de abajo."}
            </ITText>
          </div>
          {onCerrar && termino && <ITButton variant="text" icon={<FaXmark />} ariaLabel="Cerrar" title="Cerrar" onClick={onCerrar} />}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Barra porcentaje={porcentaje} color={color} corriendo={corriendo} sinPaso={!pasos.length} />
          <ITText as="span" className="w-11 shrink-0 text-right text-sm font-semibold tabular-nums">
            {corriendo && !pasos.length ? "…" : `${porcentaje}%`}
          </ITText>
        </div>
      </div>

      {(pasos.length > 0 || (error && fase === "error") || avisos.length > 0 || tarea.lineas.length > 0) && (
        <div className="flex flex-col gap-4 px-5 pb-5">
          {pasos.length > 0 && <Pasos pasos={pasos} actual={actual} fase={fase} color={color} />}

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
      )}

      {termino && (acciones || onCerrar) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          {acciones}
          {onCerrar && <ITButton label="Cerrar" variant="outlined" size="sm" onClick={onCerrar} />}
        </div>
      )}
    </div>
  );
}

// Circulo con el estado: girando mientras corre, palomita al terminar, equis si falló.
function Medallon({ color, fase }: { color: string; fase: Fase }) {
  return (
    <span
      className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
      style={{ backgroundColor: `var(--color-${color}-100)`, color: `var(--color-${color}-600)` }}
    >
      {fase === "corriendo" && (
        <span className="absolute inset-0 animate-ping rounded-2xl opacity-30" style={{ backgroundColor: `var(--color-${color}-300)` }} />
      )}
      <span className="relative">
        {fase === "corriendo" && <FaSpinner className="animate-spin" />}
        {fase === "ok" && <FaCheck />}
        {fase === "error" && <FaXmark />}
      </span>
    </span>
  );
}

// Barra de avance: con brillo mientras corre y deslizándose cuando aún no hay pasos.
function Barra({ porcentaje, color, corriendo, sinPaso }: { porcentaje: number; color: string; corriendo: boolean; sinPaso: boolean }) {
  const relleno = `linear-gradient(90deg, var(--color-${color}-400), var(--color-${color}-600))`;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: `var(--color-${color}-100)` }}>
      {corriendo && sinPaso ? (
        <span className="agente-desliza relative block h-full w-2/5 rounded-full" style={{ background: relleno }} />
      ) : (
        <div className="relative h-full rounded-full transition-all duration-500" style={{ width: `${porcentaje}%`, background: relleno }}>
          {corriendo && <span className="agente-brillo absolute inset-0 rounded-full" />}
        </div>
      )}
    </div>
  );
}

// Lista de pasos, con la linea que los une y el que va corriendo resaltado.
function Pasos({ pasos, actual, fase, color }: { pasos: Paso[]; actual?: Paso; fase: Fase; color: string }) {
  return (
    <ol className="flex flex-col">
      {pasos.map((paso, indice) => {
        const esActual = paso === actual && fase !== "ok";
        return (
          <li key={paso.n} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
                style={
                  esActual
                    ? { backgroundColor: `var(--color-${color}-100)`, color: `var(--color-${color}-600)` }
                    : { backgroundColor: "var(--color-success-100)", color: "var(--color-success-600)" }
                }
              >
                {!esActual && <FaCheck />}
                {esActual && fase === "corriendo" && <FaSpinner className="animate-spin" />}
                {esActual && fase === "error" && <FaXmark />}
              </span>
              {indice < pasos.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2 pb-4">
              <ITText as="span" className={esActual ? "text-sm font-semibold" : "text-sm"} muted={!esActual}>
                {paso.titulo}
              </ITText>
              {esActual && fase === "corriendo" && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: `var(--color-${color}-100)`, color: `var(--color-${color}-700)` }}
                >
                  En curso
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Cuánto lleva corriendo; al terminar muestra lo que tardó.
function Duracion({ desde, hasta }: { desde: number | null; hasta: number | null }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hasta) return; // ya terminó: el tiempo no cambia
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [hasta]);

  if (!desde) return null;
  const segundos = Math.max(0, Math.round(((hasta ?? ahora) - desde) / 1000));
  const reloj = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
      <FaRegClock />
      {hasta ? `Tardó ${reloj}` : reloj}
    </span>
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
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <button
        type="button"
        className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100"
        onClick={() => setAbierto(!visible)}
        aria-expanded={visible}
      >
        <ITText as="span" className="flex items-center gap-2 text-sm font-semibold">
          <FaTerminal />
          Detalle técnico
        </ITText>
        {visible ? <FaChevronUp /> : <FaChevronDown />}
      </button>
      {visible && (
        <pre ref={consola} className="m-0 max-h-64 overflow-auto bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
          {lineas.join("\n")}
        </pre>
      )}
    </div>
  );
}
