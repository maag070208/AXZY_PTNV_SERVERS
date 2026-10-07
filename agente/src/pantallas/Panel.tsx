import { ITAlert, ITButton, ITCard, ITTabs, ITText } from "@axzydev/axzy_ui_system";
import { useState } from "react";
import { FaArrowsRotate, FaClock, FaDatabase, FaGear, FaHouse, FaPowerOff, FaServer, FaTerminal } from "react-icons/fa6";
import type { EstadoAgente, NombreTarea } from "../agente";
import Acceso from "../componentes/Acceso";
import Configuracion from "../componentes/Configuracion";
import Herramientas from "../componentes/Herramientas";
import Icono from "../componentes/Icono";
import Progreso from "../componentes/Progreso";
import Relojes from "../componentes/Relojes";
import Respaldos from "../componentes/Respaldos";
import Servidores from "../componentes/Servidores";
import Soporte from "../componentes/Soporte";
import Terminal from "../componentes/Terminal";
import { fecha } from "../formato";
import { useHerramientas } from "../useHerramientas";
import type { Tarea } from "../useTarea";

const TITULOS: Record<NombreTarea, { corriendo: string; ok: string; error: string; descripcion: string }> = {
  actualizar: { corriendo: "Actualizando…", ok: "Puerto Nuevo quedó actualizado", error: "La actualización se detuvo", descripcion: "El sistema ya responde con la versión nueva." },
  aplicar: { corriendo: "Aplicando la configuración…", ok: "Configuración aplicada", error: "No se pudo aplicar la configuración", descripcion: "Los servidores ya usan la configuración nueva." },
  clonar: { corriendo: "Descargando…", ok: "Descargado", error: "No se pudo descargar", descripcion: "Terminó sin errores." },
  respaldar: { corriendo: "Respaldando la base de datos…", ok: "Respaldo guardado", error: "No se pudo respaldar", descripcion: "Quedó en la pestaña Respaldos." },
  reiniciar: { corriendo: "Reiniciando…", ok: "Reiniciado", error: "No se pudo reiniciar", descripcion: "El sistema ya responde." },
  limpiar: { corriendo: "Liberando espacio…", ok: "Espacio liberado", error: "No se pudo liberar espacio", descripcion: "Se borraron las imágenes viejas de Docker." },
};

interface Props {
  estado: EstadoAgente;
  tarea: Tarea;
  salud: boolean | null;
}

// Sistema ya instalado: el tablero del servidor.
export default function Panel({ estado, tarea, salud }: Props) {
  const herramientas = useHerramientas();
  const corriendo = tarea.fase === "corriendo";

  const actualizar = () => tarea.iniciar("actualizar", window.agente.actualizar);
  const reintentar: Record<NombreTarea, () => void> = {
    actualizar,
    aplicar: () => tarea.iniciar("aplicar", window.agente.aplicarConfiguracion),
    clonar: actualizar,
    respaldar: () => tarea.iniciar("respaldar", window.agente.respaldar),
    reiniciar: () => tarea.iniciar("reiniciar", () => window.agente.reiniciar("todo")),
    limpiar: () => tarea.iniciar("limpiar", window.agente.limpiar),
  };

  const pestanas = [
    {
      id: "inicio",
      label: "Inicio",
      icon: <FaHouse />,
      content: (
        <div className="flex flex-col gap-4">
          <ITCard>
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
                  Última actualización: {fecha(estado.ultima.fecha)} · {estado.ultima.ok ? "correcta" : "con error"}
                </ITText>
              )}
              <ITButton label="Actualizar ahora" icon={<FaArrowsRotate />} size="lg" onClick={actualizar} disabled={corriendo || !herramientas.todoListo} />
              {herramientas.herramientas && !herramientas.todoListo && (
                <ITText className="text-xs" style={{ color: "var(--color-danger-600)" }}>
                  Falta resolver algo en Ajustes → Herramientas antes de actualizar.
                </ITText>
              )}
            </div>
          </ITCard>
          <ITCard>
            <Acceso />
          </ITCard>
        </div>
      ),
    },
    { id: "servidores", label: "Servidores", icon: <FaServer />, content: <ITCard><Servidores tarea={tarea} /></ITCard> },
    { id: "relojes", label: "Relojes", icon: <FaClock />, content: <ITCard><Relojes /></ITCard> },
    { id: "respaldos", label: "Respaldos", icon: <FaDatabase />, content: <ITCard><Respaldos tarea={tarea} /></ITCard> },
    { id: "terminal", label: "Terminal", icon: <FaTerminal />, content: <ITCard><Terminal /></ITCard> },
    {
      id: "ajustes",
      label: "Ajustes",
      icon: <FaGear />,
      content: (
        <div className="flex flex-col gap-4">
          <ITCard>
            <Herramientas {...herramientas} onRevisar={herramientas.revisar} />
          </ITCard>
          <ITCard>
            <EditarConfiguracion tarea={tarea} />
          </ITCard>
          <ITCard>
            <Soporte />
          </ITCard>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {salud === false && !corriendo && (
        <ITAlert variant="error" title="Puerto Nuevo no responde">
          Los usuarios no pueden entrar al sistema. Reinicia los servidores; si sigue igual, manda la información a soporte.
          <div className="mt-2 flex flex-wrap gap-2">
            <ITButton label="Reiniciar los servidores" size="sm" icon={<FaPowerOff />} onClick={reintentar.reiniciar} />
            <Soporte compacto />
          </div>
        </ITAlert>
      )}

      {tarea.nombre && tarea.fase !== "libre" && (
        <Progreso
          tarea={tarea}
          titulos={TITULOS[tarea.nombre]}
          descripcionOk={TITULOS[tarea.nombre].descripcion}
          onCerrar={tarea.reiniciar}
          acciones={
            tarea.fase === "error" && (
              <>
                <Soporte compacto />
                <ITButton label="Reintentar" icon={<FaArrowsRotate />} onClick={reintentar[tarea.nombre]} />
              </>
            )
          }
        />
      )}

      <ITTabs items={pestanas} variant="line" />
    </div>
  );
}

function EditarConfiguracion({ tarea }: { tarea: Tarea }) {
  const [editando, setEditando] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const corriendo = tarea.fase === "corriendo";

  return (
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
            <ITButton
              label="Aplicar ahora"
              size="sm"
              onClick={() => {
                setGuardada(false);
                tarea.iniciar("aplicar", window.agente.aplicarConfiguracion);
              }}
              disabled={corriendo}
            />
          </div>
        </ITAlert>
      )}
      {!editando && !guardada && (
        <ITText muted className="text-xs">
          Contraseñas, llaves de Ably, relojes checadores y S3: con el formulario, o viendo y editando el archivo .env completo (y agregando variables nuevas).
        </ITText>
      )}
    </div>
  );
}
