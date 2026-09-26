import { ITBadget, ITButton, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { useCallback, useEffect, useState } from "react";
import { FaFileLines, FaFolderOpen } from "react-icons/fa6";
import type { EstadoAgente } from "./agente";
import Asistente from "./pantallas/Asistente";
import Panel from "./pantallas/Panel";
import { useTarea } from "./useTarea";

export default function App() {
  const [estado, setEstado] = useState<EstadoAgente | null>(null);
  // Se decide al abrir: si ya hay .env, panel; si no, el asistente hasta que termine.
  const [modo, setModo] = useState<"asistente" | "panel" | null>(null);
  const [salud, setSalud] = useState<boolean | null>(null);

  const recargar = useCallback(async () => {
    const nuevo = await window.agente.estado();
    setEstado(nuevo);
    setModo((actual) => actual ?? (nuevo.instalado ? "panel" : "asistente"));
  }, []);
  const tarea = useTarea(recargar);

  useEffect(() => {
    recargar();
    window.agente.revisarSalud();
    return window.agente.onSalud(setSalud);
  }, [recargar]);

  const usarExistente = async () => {
    const resultado = await tarea.iniciar("clonar", window.agente.usarExistente);
    if (!resultado?.actualizando) tarea.reiniciar();
    recargar();
  };

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-center gap-3 px-6 py-3 shadow-sm"
        style={{ backgroundColor: "var(--it-topbar-bg, #0D5777)", color: "var(--it-topbar-text, #ffffff)" }}
      >
        <img src="./logo-puerto-nuevo.png" alt="" className="h-10 w-auto rounded bg-white p-1" />
        <div className="flex-1">
          <ITText as="h1" className="text-base font-semibold leading-tight" style={{ color: "inherit" }}>
            Puerto Nuevo
          </ITText>
          <ITText as="span" className="text-xs opacity-80" style={{ color: "inherit" }}>
            {modo === "asistente" ? "Asistente de instalación" : "Agente de actualización"}
          </ITText>
        </div>
        {modo === "panel" && <EstadoSistema salud={salud} />}
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {!estado || !modo ? (
          <div className="flex h-full items-center justify-center">
            <ITLoader size="lg" />
          </div>
        ) : modo === "asistente" ? (
          <Asistente estado={estado} tarea={tarea} onCarpeta={recargar} onTerminar={() => setModo("panel")} />
        ) : (
          <Panel estado={estado} tarea={tarea} salud={salud} />
        )}
      </main>

      {modo === "panel" && estado && (
        <footer className="flex items-center gap-2 border-t border-slate-200 bg-white px-6 py-3">
          <FaFolderOpen className="shrink-0 text-slate-400" />
          <ITText as="span" muted className="flex-1 truncate text-xs" title={estado.carpeta ?? ""}>
            {estado.carpeta ?? "Sin carpeta"}
          </ITText>
          <ITButton label="Cambiar carpeta" variant="text" size="sm" onClick={usarExistente} disabled={tarea.fase === "corriendo"} />
          <ITButton label="Ver logs" variant="text" size="sm" icon={<FaFileLines />} onClick={() => window.agente.abrirLogs()} disabled={!estado.carpeta} />
        </footer>
      )}
    </div>
  );
}

function EstadoSistema({ salud }: { salud: boolean | null }) {
  if (salud === null) return <ITBadget label="Revisando…" color="secondary" />;
  return salud ? <ITBadget label="● Sistema en línea" color="success" /> : <ITBadget label="● Sistema sin respuesta" color="danger" />;
}
