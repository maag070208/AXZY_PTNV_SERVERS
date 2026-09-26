import { ITAlert, ITButton, ITStepper, ITText } from "@axzydev/axzy_ui_system";
import { useState } from "react";
import { FaCircleCheck, FaDownload, FaFolderOpen, FaRocket } from "react-icons/fa6";
import type { EstadoAgente } from "../agente";
import Configuracion from "../componentes/Configuracion";
import Herramientas from "../componentes/Herramientas";
import Icono from "../componentes/Icono";
import Progreso from "../componentes/Progreso";
import { useHerramientas } from "../useHerramientas";
import type { Tarea } from "../useTarea";

interface Props {
  estado: EstadoAgente;
  tarea: Tarea;
  onCarpeta: (carpeta: string | null) => void;
  onTerminar: () => void;
}

// Primera instalacion: herramientas -> descargar el repo -> .env -> instalar.
export default function Asistente({ estado, tarea, onCarpeta, onTerminar }: Props) {
  const [paso, setPaso] = useState(0);
  const [destino, setDestino] = useState(estado.carpetaSugerida);
  const [errorCarpeta, setErrorCarpeta] = useState<string | null>(null);
  const [configGuardada, setConfigGuardada] = useState(false);
  const herramientas = useHerramientas();

  const corriendo = tarea.fase === "corriendo";
  const clonando = tarea.nombre === "clonar";
  const instalado = tarea.nombre === "actualizar" && tarea.fase === "ok";

  const clonar = async () => {
    setErrorCarpeta(null);
    const resultado = (await tarea.iniciar("clonar", () => window.agente.clonar(destino))) as { carpeta: string; yaExistia: boolean } | undefined;
    if (resultado?.yaExistia) {
      tarea.setFase("ok");
      onCarpeta(resultado.carpeta);
    }
  };

  const usarExistente = async () => {
    const resultado = await window.agente.usarExistente();
    setErrorCarpeta(resultado.error ?? null);
    if (!resultado.error) onCarpeta(resultado.carpeta);
  };

  const elegirDestino = async () => {
    const elegido = await window.agente.elegirDestino();
    if (elegido) setDestino(elegido);
  };

  const pasos = [
    {
      label: "Herramientas",
      content: (
        <div className="flex flex-col gap-4">
          <ITText muted className="text-sm">
            Puerto Nuevo necesita estas herramientas{estado.plataforma === "win32" ? " (en Windows se usan dentro de WSL)" : ""}. Si falta alguna, aquí te
            digo qué descargar o te abro una terminal con el comando listo.
          </ITText>
          <Herramientas {...herramientas} onRevisar={herramientas.revisar} />
          {herramientas.todoListo && (
            <ITAlert variant="success" title="Todo listo">
              Ya tienes todo lo necesario. Continúa con «Siguiente».
            </ITAlert>
          )}
        </div>
      ),
    },
    {
      label: "Descargar",
      content: (
        <div className="flex flex-col gap-4">
          {estado.carpeta && !clonando ? (
            <div className="flex items-center gap-4">
              <Icono color="success" tamano="chico">
                <FaCircleCheck />
              </Icono>
              <div className="flex-1">
                <ITText className="font-semibold">Puerto Nuevo ya está descargado</ITText>
                <ITText muted className="break-all text-xs">
                  {estado.carpeta}
                </ITText>
              </div>
              <ITButton label="Usar otra carpeta" variant="text" size="sm" onClick={usarExistente} />
            </div>
          ) : (
            <>
              <ITText muted className="text-sm">
                Se descarga el repositorio <b>AXZY_PTNV_SERVERS</b> dentro de la carpeta que elijas.
              </ITText>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                <FaFolderOpen className="text-slate-400" />
                <ITText as="span" className="flex-1 break-all text-sm">
                  {destino}
                </ITText>
                <ITButton label="Cambiar" variant="text" size="sm" onClick={elegirDestino} disabled={corriendo} />
              </div>
              <div className="flex flex-wrap gap-2">
                <ITButton label="Descargar Puerto Nuevo" icon={<FaDownload />} onClick={clonar} disabled={corriendo} />
                <ITButton label="Ya lo tengo descargado" variant="outlined" onClick={usarExistente} disabled={corriendo} />
              </div>
            </>
          )}
          {errorCarpeta && <ITAlert variant="error">{errorCarpeta}</ITAlert>}
          {clonando && <Progreso tarea={tarea} titulos={{ corriendo: "Descargando…", ok: "Descargado", error: "No se pudo descargar" }} />}
        </div>
      ),
    },
    {
      label: "Configurar",
      content: configGuardada ? (
        <ITAlert variant="success" title="Configuración guardada">
          Continúa con «Siguiente» para instalar.
          <ITButton label="Volver a editar" variant="link" size="sm" onClick={() => setConfigGuardada(false)} />
        </ITAlert>
      ) : (
        estado.carpeta && <Configuracion onGuardado={() => setConfigGuardada(true)} />
      ),
    },
    {
      label: "Instalar",
      content: (
        <div className="flex flex-col gap-4">
          {tarea.nombre !== "actualizar" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <Icono color="primary">
                <FaRocket />
              </Icono>
              <ITText as="h2" className="text-xl font-semibold">
                Instalar y arrancar Puerto Nuevo
              </ITText>
              <ITText muted className="max-w-md text-sm">
                Baja las imágenes del sistema, crea la base de datos, aplica las migraciones y arranca los servidores. La primera vez tarda varios minutos.
              </ITText>
              <ITButton label="Instalar ahora" icon={<FaRocket />} size="lg" onClick={() => tarea.iniciar("actualizar", window.agente.actualizar)} />
            </div>
          )}
          {tarea.nombre === "actualizar" && (
            <Progreso
              tarea={tarea}
              titulos={{ corriendo: "Instalando…", ok: "Puerto Nuevo quedó instalado", error: "La instalación se detuvo" }}
              descripcionOk="Abre http://localhost:8080 en el navegador. Presiona «Finalizar» para ir al panel."
            />
          )}
          {tarea.nombre === "actualizar" && tarea.fase === "error" && (
            <div className="flex justify-end">
              <ITButton label="Reintentar" onClick={() => tarea.iniciar("actualizar", window.agente.actualizar)} />
            </div>
          )}
        </div>
      ),
    },
  ];

  const puedeSeguir = [herramientas.todoListo, !!estado.carpeta && !corriendo, configGuardada, instalado][paso];

  return (
    <ITStepper
      steps={pasos}
      currentStep={paso}
      onStepChange={setPaso}
      allowClickToJump={!corriendo}
      disableNext={!puedeSeguir}
      onFinish={onTerminar}
      containerClassName="max-w-3xl px-0"
    />
  );
}
