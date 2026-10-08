import { ITAlert, ITBadget, ITButton, ITLoader, ITProgress, ITText } from "@axzydev/axzy_ui_system";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowsRotate, FaBroom, FaPowerOff, FaStop, FaTerminal } from "react-icons/fa6";
import type { EstadoServidor, Servicio } from "../agente";
import { bytes } from "../formato";
import type { Tarea } from "../useTarea";

const NOMBRE: Record<Servicio, string> = { api: "API", web: "Web", postgres: "Base de datos" };
const MAX_LINEAS_LOG = 2000;
// Relectura del estado mientras la pantalla está abierta. Docker tarda unos
// segundos en marcar sana a la base (su healthcheck corre cada 5 s) aunque ya
// acepte conexiones; sin esto el panel se queda con la foto del arranque y
// sigue diciendo "Arrancando" con la base ya levantada.
const REFRESCO_MS = 5000;
// Aviso de disco: menos de 10 GB o menos del 5% libre.
const POCO_ESPACIO = (d: { total: number; libre: number }) => d.libre < 10 * 1024 ** 3 || d.libre / d.total < 0.05;

function etiqueta(estado: string, salud: string): { texto: string; color: "success" | "danger" | "warning" } {
  if (estado !== "running") return { texto: estado === "exited" ? "Detenido" : estado || "Sin crear", color: "danger" };
  if (salud === "unhealthy") return { texto: "Con fallas", color: "warning" };
  if (salud === "starting") return { texto: "Arrancando", color: "warning" };
  return { texto: "Corriendo", color: "success" };
}

// Servicios de Docker, sus logs en vivo y el espacio en disco.
export default function Servidores({ tarea }: { tarea: Tarea }) {
  const [estado, setEstado] = useState<EstadoServidor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logDe, setLogDe] = useState<Servicio | null>(null);
  const corriendo = tarea.fase === "corriendo";

  // Una sola lectura a la vez: `operar.sh estado` arranca un proceso en WSL y
  // dos lecturas encimadas se estorban.
  const leyendo = useRef(false);
  const conDatos = useRef(false);
  const cargar = useCallback(() => {
    if (leyendo.current) return;
    leyendo.current = true;
    setError(null);
    window.agente
      .estadoServidor()
      .then((nuevo) => {
        conDatos.current = true;
        setEstado(nuevo);
      })
      .catch((e) => {
        // Un refresco fallido no borra lo que ya se está viendo (el aviso de
        // "Docker no responde" lo da el propio estado); solo se reporta si
        // todavía no hay nada en pantalla.
        if (!conDatos.current) {
          setError(String(e).replace(/^Error: Error invoking remote method '[^']+': (Error: )?/, ""));
        }
      })
      .finally(() => {
        leyendo.current = false;
      });
  }, []);

  // Al abrir, cada pocos segundos mientras la pantalla está abierta (para ver
  // pasar "Arrancando" → "Corriendo") y al terminar cada tarea (reiniciar,
  // actualizar…).
  useEffect(() => {
    if (corriendo) return undefined;
    cargar();
    const reloj = window.setInterval(cargar, REFRESCO_MS);
    return () => window.clearInterval(reloj);
  }, [corriendo, cargar]);

  const reiniciar = (servicio: Servicio | "todo") => tarea.iniciar("reiniciar", () => window.agente.reiniciar(servicio));

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (!estado) return <ITLoader size="md" />;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <ITText as="h3" className="font-semibold">
            Servicios
          </ITText>
          <div className="flex gap-2">
            <ITButton label="Actualizar" variant="text" size="sm" icon={<FaArrowsRotate />} onClick={cargar} />
            <ITButton label="Reiniciar todo" size="sm" icon={<FaPowerOff />} onClick={() => reiniciar("todo")} disabled={corriendo} />
          </div>
        </div>
        {estado.docker !== "ok" && (
          <ITAlert variant="error" title="Docker no responde">
            «Reiniciar todo» intenta arrancarlo. Si no se puede, revisa la pestaña Ajustes → Herramientas.
          </ITAlert>
        )}
        {estado.docker === "ok" && estado.servicios.length === 0 && (
          <ITAlert variant="warning">No hay contenedores de Puerto Nuevo. «Reiniciar todo» los crea.</ITAlert>
        )}
        {estado.servicios.length > 0 && (
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {estado.servicios.map((s) => {
              const { texto, color } = etiqueta(s.estado, s.salud);
              return (
                <li key={s.servicio} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-40 flex-1">
                    <ITText as="span" className="text-sm font-medium">
                      {NOMBRE[s.servicio] ?? s.servicio}
                    </ITText>
                    <ITText as="span" muted className="block text-xs">
                      {s.detalle}
                    </ITText>
                  </div>
                  <ITBadget label={texto} color={color} size="sm" />
                  <ITButton label="Logs" variant="text" size="sm" icon={<FaTerminal />} onClick={() => setLogDe(s.servicio)} />
                  <ITButton label="Reiniciar" variant="outlined" size="sm" onClick={() => reiniciar(s.servicio)} disabled={corriendo} />
                </li>
              );
            })}
          </ul>
        )}
        {logDe && <LogEnVivo servicio={logDe} onCerrar={() => setLogDe(null)} />}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <ITText as="h3" className="font-semibold">
            Espacio en disco
          </ITText>
          <ITButton
            label="Liberar espacio"
            variant="outlined"
            size="sm"
            icon={<FaBroom />}
            onClick={() => tarea.iniciar("limpiar", window.agente.limpiar)}
            disabled={corriendo || estado.docker !== "ok"}
          />
        </div>
        {estado.disco && (
          <div className="flex flex-col gap-2">
            <ITProgress
              value={estado.disco.total - estado.disco.libre}
              max={estado.disco.total}
              color={POCO_ESPACIO(estado.disco) ? "danger" : "primary"}
            />
            <ITText muted className="text-xs">
              Libres {bytes(estado.disco.libre)} de {bytes(estado.disco.total)} en el disco donde está Puerto Nuevo.
            </ITText>
            {POCO_ESPACIO(estado.disco) && (
              <ITAlert variant="warning" title="Queda poco espacio">
                Si el disco se llena, la base de datos deja de guardar. Prueba «Liberar espacio» (borra imágenes viejas de Docker, no la base) y pide ayuda a
                soporte.
              </ITAlert>
            )}
          </div>
        )}
        {estado.usoDocker.length > 0 && (
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {estado.usoDocker.map((d) => (
              <li key={d.tipo} className="flex items-center gap-3 px-4 py-2">
                <ITText as="span" className="flex-1 text-sm">
                  {{ Images: "Imágenes", Containers: "Contenedores", "Local Volumes": "Volúmenes (base de datos)", "Build Cache": "Caché" }[d.tipo] ?? d.tipo}
                </ITText>
                <ITText as="span" className="text-sm">
                  {d.tamano}
                </ITText>
                <ITText as="span" muted className="w-40 text-right text-xs">
                  se puede liberar {d.recuperable}
                </ITText>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LogEnVivo({ servicio, onCerrar }: { servicio: Servicio; onCerrar: () => void }) {
  const [lineas, setLineas] = useState<string[]>([]);
  const consola = useRef<HTMLPreElement>(null);
  const pegado = useRef(true); // sigue el final mientras no se suba a leer

  useEffect(() => {
    setLineas([]);
    const quitar = window.agente.onLogs((nuevas) => setLineas((previas) => [...previas, ...nuevas].slice(-MAX_LINEAS_LOG)));
    window.agente.verLogs(servicio);
    return () => {
      quitar();
      window.agente.detenerLogs();
    };
  }, [servicio]);

  useEffect(() => {
    if (pegado.current) consola.current?.scrollTo({ top: consola.current.scrollHeight });
  }, [lineas]);

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between px-3 py-2">
        <ITText as="span" className="text-sm font-semibold">
          Log en vivo · {NOMBRE[servicio]}
        </ITText>
        <ITButton label="Cerrar" variant="text" size="sm" icon={<FaStop />} onClick={onCerrar} />
      </div>
      <pre
        ref={consola}
        onScroll={(e) => {
          const el = e.currentTarget;
          pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="m-0 h-72 overflow-auto rounded-b-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100"
      >
        {lineas.length ? lineas.join("\n") : "Esperando líneas…"}
      </pre>
    </div>
  );
}
