import { ITBadget, ITButton, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { FaPlay, FaStop, FaTrashCan } from "react-icons/fa6";

// Líneas que se conservan en pantalla (la salida de un `logs` es larga).
const MAX_LINEAS = 500;

// Lo que más se usa en soporte, para no escribirlo cada vez.
const RAPIDOS: { label: string; comando: string }[] = [
  { label: "Servidores", comando: "docker compose ps" },
  { label: "Log del API", comando: "docker compose logs --tail=200 api" },
  { label: "Log en vivo", comando: "docker compose logs -f --tail=50 api" },
  { label: "Commit actual", comando: "git log --oneline -3" },
  { label: "Cambios locales", comando: "git status --short" },
  { label: "Disco", comando: "df -h / /mnt/c" },
  { label: "Docker", comando: "docker system df" },
];

// Consola del servidor: corre comandos dentro de WSL, en la carpeta del
// repositorio (ahí funcionan `docker compose`, `git` y los scripts del repo).
export default function Terminal() {
  const [texto, setTexto] = useState("");
  const [lineas, setLineas] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [historial, setHistorial] = useState<string[]>([]);
  const [recuerdo, setRecuerdo] = useState<number | null>(null);
  const caja = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const agregar = (nuevas: string[]) =>
      setLineas((previas) => [...previas, ...nuevas].slice(-MAX_LINEAS));
    const quitar = [
      window.agente.onTermInicio(({ comando }) => {
        setCorriendo(true);
        agregar([`$ ${comando}`]);
      }),
      // La salida llega en trozos: se parten por línea para poder recortar.
      window.agente.onTermSalida((trozo) => agregar(trozo.replace(/\r/g, "").split("\n"))),
      window.agente.onTermFin(({ codigo }) => {
        setCorriendo(false);
        agregar(codigo === 0 ? [""] : [`— terminó con código ${codigo} —`]);
      }),
    ];
    return () => quitar.forEach((soltar) => soltar());
  }, []);

  // Pegado abajo mientras llega la salida.
  useEffect(() => {
    if (caja.current) caja.current.scrollTop = caja.current.scrollHeight;
  }, [lineas]);

  const ejecutar = async (comando: string = texto) => {
    const limpio = comando.trim();
    if (!limpio || corriendo) return;
    setTexto("");
    setRecuerdo(null);
    setHistorial((previos) => [...previos.filter((c) => c !== limpio), limpio]);
    await window.agente.terminalCorrer(limpio);
  };

  // ↑/↓ recorren lo ya escrito, como en una terminal.
  const recordar = (paso: number) => {
    if (historial.length === 0) return;
    const siguiente = recuerdo === null ? historial.length - 1 : recuerdo + paso;
    if (siguiente < 0) return;
    if (siguiente >= historial.length) {
      setRecuerdo(null);
      setTexto("");
      return;
    }
    setRecuerdo(siguiente);
    setTexto(historial[siguiente]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <ITText as="h3" className="font-semibold">
            Terminal del servidor
          </ITText>
          <ITText muted className="text-xs">
            Los comandos corren dentro de WSL, en la carpeta del repositorio. Es la misma consola que se usaría por escritorio.
          </ITText>
        </div>
        {corriendo ? <ITBadget label="● Ejecutando" color="warning" /> : <ITBadget label="Listo" color="secondary" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RAPIDOS.map((rapido) => (
          <ITButton
            key={rapido.comando}
            label={rapido.label}
            variant="outlined"
            size="sm"
            onClick={() => ejecutar(rapido.comando)}
            disabled={corriendo}
          />
        ))}
      </div>

      <pre
        ref={caja}
        className="h-80 w-full overflow-auto rounded-lg px-3 py-2 font-mono text-xs leading-relaxed"
        style={{ backgroundColor: "#0b1220", color: "#e2e8f0" }}
      >
        {lineas.length === 0 ? "Escribe un comando y presiona Enter (↑ recupera los anteriores)." : lineas.join("\n")}
      </pre>

      <div className="flex items-center gap-2" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && ejecutar()}>
        <div className="flex-1">
          <ITInput
            name="terminal"
            placeholder="docker compose logs --tail=100 api"
            value={texto}
            disabled={corriendo}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTexto(e.target.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                recordar(-1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                recordar(1);
              }
            }}
          />
        </div>
        {corriendo ? (
          <ITButton label="Detener" color="danger" icon={<FaStop />} onClick={() => window.agente.terminalDetener()} />
        ) : (
          <ITButton label="Ejecutar" icon={<FaPlay />} onClick={() => ejecutar()} disabled={!texto.trim()} />
        )}
        <ITButton
          label="Limpiar"
          variant="text"
          icon={<FaTrashCan />}
          onClick={() => setLineas([])}
          disabled={lineas.length === 0}
        />
      </div>

      <ITText muted className="text-xs">
        Ojo: <code>sudo</code> o cualquier comando que pida contraseña se queda esperando (no hay forma de escribirle); usa <b>Detener</b>.
      </ITText>
    </div>
  );
}
