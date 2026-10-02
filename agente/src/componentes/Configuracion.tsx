import { ITAlert, ITButton, ITInput, ITLoader, ITSegmentedControl, ITText } from "@axzydev/axzy_ui_system";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { FaFloppyDisk, FaListUl, FaPlus, FaRegFileCode, FaTrash } from "react-icons/fa6";
import type { ArchivoEnv, Campo } from "../agente";

interface Props {
  onGuardado: () => void;
  textoBoton?: string;
}

// Una variable nueva que se agrega desde el formulario.
interface Nueva {
  id: number;
  clave: string;
  valor: string;
}

const NOMBRE_VALIDO = /^[A-Za-z_][A-Za-z0-9_]*$/;
const esSecreto = (clave: string) => /PASS|PWD|SECRET|KEY|TOKEN/.test(clave);
// Electron envuelve los errores del proceso principal: se muestra solo el mensaje.
const mensaje = (error: unknown) => String(error).replace(/^Error: Error invoking remote method '[^']+': (Error: )?/, "");

// El .env: formulario con los campos de .env.example (más los que alguien haya
// agregado al archivo, y los que se agreguen aquí) y vista del archivo completo
// para verlo y editarlo tal cual.
export default function Configuracion({ onGuardado, textoBoton = "Guardar configuración" }: Props) {
  const [vista, setVista] = useState<"formulario" | "archivo">("formulario");
  const [campos, setCampos] = useState<Campo[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [nuevas, setNuevas] = useState<Nueva[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<ArchivoEnv | null>(null);
  const [texto, setTexto] = useState("");
  const [guardandoArchivo, setGuardandoArchivo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const siguiente = useRef(1);

  const cargar = async () => {
    const leidos = await window.agente.leerConfiguracion();
    setCampos(leidos);
    setValores(Object.fromEntries(leidos.map((c) => [c.clave, c.valor])));
    setNuevas([]);
  };

  useEffect(() => {
    cargar().catch((e) => setError(mensaje(e)));
  }, []);

  // El archivo se lee al abrir su vista y después de guardarlo.
  const leerArchivo = () =>
    window.agente.leerEnv().then((leido) => {
      setArchivo(leido);
      setTexto(leido.texto);
    });

  const abrirArchivo = () => {
    setVista("archivo");
    setErrorArchivo(null);
    leerArchivo().catch((e) => setErrorArchivo(mensaje(e)));
  };

  const agregar = () => setNuevas((lista) => [...lista, { id: siguiente.current++, clave: "", valor: "" }]);
  const cambiarNueva = (id: number, cambio: Partial<Nueva>) => setNuevas((lista) => lista.map((n) => (n.id === id ? { ...n, ...cambio } : n)));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const todos = { ...valores };
      const agregadas = new Set<string>();
      for (const nueva of nuevas) {
        const clave = nueva.clave.trim();
        if (!clave && !nueva.valor.trim()) continue; // fila vacía: se ignora
        if (!NOMBRE_VALIDO.test(clave)) throw new Error(`«${clave || "(sin nombre)"}» no sirve como nombre de variable: letras, números y _ , empezando con letra.`);
        if (clave in todos) throw new Error(`${clave} ya está en la lista de arriba: cámbiala ahí.`);
        if (agregadas.has(clave)) throw new Error(`${clave} está repetida.`);
        agregadas.add(clave);
        todos[clave] = nueva.valor;
      }
      await window.agente.guardarConfiguracion(todos);
      onGuardado();
      await cargar(); // las variables nuevas pasan a la lista de arriba
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const guardarArchivo = async () => {
    setGuardandoArchivo(true);
    setErrorArchivo(null);
    try {
      await window.agente.guardarEnv(texto);
      await leerArchivo();
      onGuardado();
    } catch (e) {
      setErrorArchivo(mensaje(e));
    } finally {
      setGuardandoArchivo(false);
    }
  };

  if (error && !campos) return <ITAlert variant="error">{error}</ITAlert>;
  if (!campos) return <ITLoader size="md" />;

  const cambiado = !!archivo && texto !== archivo.texto;

  return (
    <div className="flex flex-col gap-4">
      <ITSegmentedControl
        size="sm"
        className="self-start"
        value={vista}
        onChange={(valor) => (valor === "archivo" ? abrirArchivo() : setVista("formulario"))}
        options={[
          { value: "formulario", label: "Formulario", icon: <FaListUl /> },
          { value: "archivo", label: "Archivo", icon: <FaRegFileCode /> },
        ]}
      />

      {vista === "archivo" ? (
        <div className="flex flex-col gap-3">
          <ITText muted className="text-sm">
            El archivo <code>.env</code> tal cual. Puedes corregir valores y agregar variables nuevas: una por línea y con la forma <code>CLAVE=valor</code>.
            Las líneas que empiezan con <code>#</code> son comentarios.
          </ITText>
          {/* A mano y no con ITTextarea: lleva monoespaciada y sin corrector, que en un .env subraya todo. */}
          <textarea
            name="env"
            rows={18}
            spellCheck={false}
            autoComplete="off"
            value={texto}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setTexto(e.target.value)}
            className="w-full rounded-lg border border-solid border-secondary-300 px-3 py-2 font-mono text-xs outline-none transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          <ITText muted className="text-xs">
            Si la base de datos ya está creada, no cambies <code>POSTGRES_PASSWORD</code>: el API dejaría de entrar. Al guardar, lo anterior queda en{" "}
            <code>.env.bak</code>; los cambios se aplican al reiniciar los servidores.
          </ITText>
          {archivo && !archivo.existe && (
            <ITAlert variant="info">
              Todavía no hay <code>.env</code>: al guardar se crea con lo que ves aquí.
            </ITAlert>
          )}
          {errorArchivo && <ITAlert variant="error">{errorArchivo}</ITAlert>}
          <div className="flex items-center justify-between gap-2">
            <ITText muted className="truncate font-mono text-xs" title={archivo?.ruta}>
              {archivo?.ruta ?? ""}
            </ITText>
            <div className="flex shrink-0 gap-2">
              {cambiado && <ITButton label="Descartar" variant="text" onClick={() => setTexto(archivo?.texto ?? "")} disabled={guardandoArchivo} />}
              <ITButton
                label={guardandoArchivo ? "Guardando…" : "Guardar archivo"}
                icon={<FaFloppyDisk />}
                onClick={guardarArchivo}
                disabled={guardandoArchivo || !cambiado}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ITText muted className="text-sm">
            Se guarda en el archivo <code>.env</code>. Las contraseñas de la base y de las sesiones ya vienen generadas; lo demás pídelo a soporte si no lo
            tienes (puedes dejarlo vacío y llenarlo después).
          </ITText>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campos.map((campo) => {
              const nota = campo.soloLectura
                ? "No se puede cambiar: la base de datos ya se creó con esta contraseña."
                : campo.adicional
                  ? "No está en .env.example: la agregó alguien a mano."
                  : campo.ayuda;
              return (
                <div key={campo.clave} className="flex flex-col gap-1">
                  <ITInput
                    name={campo.clave}
                    label={campo.clave}
                    type={campo.secreto ? "password" : "text"}
                    value={valores[campo.clave] ?? ""}
                    readOnly={campo.soloLectura}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setValores((v) => ({ ...v, [campo.clave]: e.target.value }))}
                  />
                  {nota && (
                    <ITText muted className="text-xs">
                      {nota}
                    </ITText>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <ITText as="h4" className="text-sm font-semibold">
                  Agregar variables
                </ITText>
                <ITText muted className="text-xs">
                  Las que no están arriba. Se escriben en el <code>.env</code> al guardar.
                </ITText>
              </div>
              <ITButton label="Agregar" variant="outlined" size="sm" icon={<FaPlus />} onClick={agregar} />
            </div>
            {nuevas.map((nueva) => (
              <div key={nueva.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <ITInput
                  name={`nueva-clave-${nueva.id}`}
                  placeholder="NOMBRE_DE_LA_VARIABLE"
                  value={nueva.clave}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => cambiarNueva(nueva.id, { clave: e.target.value })}
                />
                <ITInput
                  name={`nueva-valor-${nueva.id}`}
                  placeholder="Valor"
                  type={esSecreto(nueva.clave) ? "password" : "text"}
                  value={nueva.valor}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => cambiarNueva(nueva.id, { valor: e.target.value })}
                />
                <ITButton variant="text" color="danger" icon={<FaTrash />} ariaLabel="Quitar" onClick={() => setNuevas((lista) => lista.filter((n) => n.id !== nueva.id))} />
              </div>
            ))}
          </div>

          {error && <ITAlert variant="error">{error}</ITAlert>}
          <div className="flex justify-end">
            <ITButton label={guardando ? "Guardando…" : textoBoton} icon={<FaFloppyDisk />} onClick={guardar} disabled={guardando} />
          </div>
        </div>
      )}
    </div>
  );
}
