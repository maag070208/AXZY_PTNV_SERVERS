import { ITAlert, ITButton, ITCard, ITText } from "@axzydev/axzy_ui_system";
import { useState } from "react";
import { FaArrowsRotate, FaGear } from "react-icons/fa6";
import type { EstadoAgente } from "../agente";
import Configuracion from "../componentes/Configuracion";
import Herramientas from "../componentes/Herramientas";
import Icono from "../componentes/Icono";
import Progreso from "../componentes/Progreso";
import Respaldos from "../componentes/Respaldos";
import { useHerramientas } from "../useHerramientas";
import type { Tarea } from "../useTarea";

const formatoFecha = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });

const TITULOS = {
  actualizar: { corriendo: "Actualizando…", ok: "Puerto Nuevo quedó actualizado", error: "La actualización se detuvo" },
  aplicar: { corriendo: "Aplicando la configuración…", ok: "Configuración aplicada", error: "No se pudo aplicar la configuración" },
  clonar: { corriendo: "Descargando…", ok: "Descargado", error: "No se pudo descargar" },
  respaldar: { corriendo: "Respaldando la base de datos…", ok: "Respaldo guardado", error: "No se pudo respaldar" },
};

const DESCRIPCION_OK: Record<keyof typeof TITULOS, string> = {
  actualizar: "El sistema ya responde con la versión nueva.",
  aplicar: "Los servidores ya usan la configuración nueva.",
  clonar: "Terminó sin errores.",
  respaldar: "Quedó en la carpeta respaldos (abajo).",
};

// Sistema ya instalado: actualizar, revisar herramientas y editar el .env.
export default function Panel({ estado, tarea }: { estado: EstadoAgente; tarea: Tarea }) {
  const [editando, setEditando] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const herramientas = useHerramientas();
  const corriendo = tarea.fase === "corriendo";

  const actualizar = () => tarea.iniciar("actualizar", window.agente.actualizar);
  const respaldar = () => tarea.iniciar("respaldar", window.agente.respaldar);
  const aplicar = () => {
    setGuardada(false);
    tarea.iniciar("aplicar", window.agente.aplicarConfiguracion);
  };

  return (
    <div className="flex flex-col gap-4">
      <ITCard>
        {tarea.fase === "libre" || !tarea.nombre ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Icono color="primary">
              <FaArrowsRotate />
            </Icono>
            <ITText as="h2" className="text-xl font-semibold">
              Actualizar Puerto Nuevo
            </ITText>
            <ITText muted className="max-w-md text-sm">
              Respalda la base de datos, baja la versión nueva, aplica las migraciones y reinicia los servidores. Tarda unos minutos; no apagues la
              computadora mientras tanto.
            </ITText>
            {estado.ultima && (
              <ITText muted className="text-xs">
                Última actualización: {formatoFecha(estado.ultima.fecha)} · {estado.ultima.ok ? "correcta" : "con error"}
              </ITText>
            )}
            <ITButton label="Actualizar ahora" icon={<FaArrowsRotate />} size="lg" onClick={actualizar} disabled={!herramientas.todoListo} />
            {herramientas.herramientas && !herramientas.todoListo && (
              <ITText className="text-xs" style={{ color: "var(--color-danger-600)" }}>
                Falta resolver algo en «Herramientas» (abajo) antes de actualizar.
              </ITText>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <Progreso tarea={tarea} titulos={TITULOS[tarea.nombre]} descripcionOk={DESCRIPCION_OK[tarea.nombre]} />
            {!corriendo && (
              <div className="flex justify-end gap-2">
                <ITButton label="Volver" variant="text" onClick={tarea.reiniciar} />
                {tarea.fase === "error" && (
                  <ITButton
                    label="Reintentar"
                    icon={<FaArrowsRotate />}
                    onClick={{ aplicar, actualizar, respaldar, clonar: actualizar }[tarea.nombre]}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </ITCard>

      <ITCard>
        <Respaldos tarea={tarea} />
      </ITCard>

      <ITCard>
        <Herramientas {...herramientas} onRevisar={herramientas.revisar} />
      </ITCard>

      <ITCard>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <ITText as="h3" className="font-semibold">
              Configuración
            </ITText>
            {!editando && <ITButton label="Editar" variant="text" size="sm" icon={<FaGear />} onClick={() => setEditando(true)} disabled={corriendo} />}
          </div>
          {editando && (
            <Configuracion
              onGuardado={() => {
                setEditando(false);
                setGuardada(true);
              }}
            />
          )}
          {guardada && (
            <ITAlert variant="info" title="Configuración guardada">
              Se aplica al reiniciar los servidores.
              <div className="mt-2">
                <ITButton label="Aplicar ahora" size="sm" onClick={aplicar} disabled={corriendo} />
              </div>
            </ITAlert>
          )}
          {!editando && !guardada && (
            <ITText muted className="text-xs">
              Contraseñas, llaves de Ably, relojes checadores y S3 (archivo .env).
            </ITText>
          )}
        </div>
      </ITCard>
    </div>
  );
}
