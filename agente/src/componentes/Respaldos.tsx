import { ITButton, ITText } from "@axzydev/axzy_ui_system";
import { useEffect, useState } from "react";
import { FaDatabase, FaFolderOpen } from "react-icons/fa6";
import type { Respaldo } from "../agente";
import type { Tarea } from "../useTarea";

const MOSTRAR = 5;
const formatoFecha = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
const formatoTamano = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Respaldos de la base: los mas recientes y el boton para sacar uno nuevo.
export default function Respaldos({ tarea }: { tarea: Tarea }) {
  const [respaldos, setRespaldos] = useState<Respaldo[]>([]);
  const corriendo = tarea.fase === "corriendo";

  // Se vuelve a leer al terminar cualquier tarea (actualizar tambien respalda).
  useEffect(() => {
    if (!corriendo) window.agente.listarRespaldos().then(setRespaldos).catch(() => setRespaldos([]));
  }, [corriendo]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <ITText as="h3" className="font-semibold">
          Respaldos de la base de datos
        </ITText>
        <div className="flex gap-2">
          <ITButton label="Abrir carpeta" variant="text" size="sm" icon={<FaFolderOpen />} onClick={() => window.agente.abrirRespaldos()} />
          <ITButton label="Respaldar ahora" size="sm" icon={<FaDatabase />} onClick={() => tarea.iniciar("respaldar", window.agente.respaldar)} disabled={corriendo} />
        </div>
      </div>
      <ITText muted className="text-xs">
        Se guardan los últimos 14 en la carpeta <code>respaldos</code>. No incluyen las checadas de los relojes: se vuelven a bajar de los relojes al
        restaurar.
      </ITText>
      {respaldos.length === 0 ? (
        <ITText muted className="text-sm">
          Todavía no hay respaldos.
        </ITText>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
          {respaldos.slice(0, MOSTRAR).map((r) => (
            <li key={r.nombre} className="flex items-center gap-3 px-4 py-2">
              <FaDatabase className="shrink-0 text-slate-400" />
              <ITText as="span" className="flex-1 text-sm">
                {formatoFecha(r.fecha)}
              </ITText>
              <ITText as="span" muted className="text-xs">
                {formatoTamano(r.bytes)}
              </ITText>
            </li>
          ))}
        </ul>
      )}
      {respaldos.length > MOSTRAR && (
        <ITText muted className="text-xs">
          y {respaldos.length - MOSTRAR} más en la carpeta.
        </ITText>
      )}
    </div>
  );
}
