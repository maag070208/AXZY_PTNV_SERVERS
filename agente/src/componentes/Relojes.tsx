import { ITAlert, ITBadget, ITButton, ITChip, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { useCallback, useEffect, useState } from "react";
import { FaArrowsRotate, FaClock } from "react-icons/fa6";
import type { Reloj } from "../agente";
import { fecha, haceCuanto, numero } from "../formato";

// El worker del API sincroniza cada 5 minutos: con 15 sin sincronizar ya algo anda mal.
const MINUTOS_ATRASADO = 15;
const atrasado = (iso: string | null) => !iso || Date.now() - new Date(iso).getTime() > MINUTOS_ATRASADO * 60000;

// Relojes checadores leidos de la base, y si el servidor los alcanza en la red.
export default function Relojes() {
  const [relojes, setRelojes] = useState<Reloj[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    window.agente
      .relojes()
      .then(setRelojes)
      .catch((e) => setError(String(e).replace(/^Error: Error invoking remote method '[^']+': (Error: )?/, "")))
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <ITText as="h3" className="font-semibold">
          Relojes checadores
        </ITText>
        <ITButton label={cargando ? "Revisando…" : "Actualizar"} variant="text" size="sm" icon={<FaArrowsRotate />} onClick={cargar} disabled={cargando} />
      </div>
      <ITText muted className="text-xs">
        Se dan de alta y se sincronizan desde la web (Configuración → Relojes checadores). El sistema solo lee de ellos.
      </ITText>
      {error && <ITAlert variant="error">{error}</ITAlert>}
      {!relojes && !error && <ITLoader size="md" />}
      {relojes?.length === 0 && <ITText muted className="text-sm">No hay relojes dados de alta.</ITText>}
      <ul className="flex flex-col gap-3">
        {relojes?.map((r) => {
          const baja = !r.url;
          const red = baja ? { texto: "Dado de baja", color: "secondary" as const } : r.enRed ? { texto: "Responde", color: "success" as const } : { texto: "No responde", color: "danger" as const };
          const tarde = !baja && atrasado(r.sincronizado);
          return (
            <li key={r.serie} className="flex flex-col gap-2 rounded-lg border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <FaClock className="text-slate-400" />
                <ITText as="span" className="flex-1 text-sm font-semibold">
                  {r.nombre || r.serie}
                </ITText>
                {r.cuenta && <ITChip label="Cuenta para asistencia" size="sm" />}
                <ITBadget label={red.texto} color={red.color} size="sm" />
              </div>
              <ITText muted className="break-all text-xs">
                {r.url ?? "sin dirección"} · serie {r.serie}
              </ITText>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                <Dato titulo="Checadas guardadas" valor={numero(r.checadas)} />
                <Dato titulo="Última checada" valor={r.ultima ? fecha(r.ultima) : "—"} />
                <Dato
                  titulo="Última sincronización"
                  valor={r.sincronizado ? haceCuanto(r.sincronizado) : "nunca"}
                  alerta={tarde}
                />
              </div>
              {tarde && r.enRed && (
                <ITText className="text-xs" style={{ color: "var(--color-warning-700)" }}>
                  Responde en la red pero no se ha sincronizado en más de {MINUTOS_ATRASADO} minutos: revisa el usuario de los relojes (Ajustes → Configuración) o
                  reinicia el API.
                </ITText>
              )}
              {!baja && r.enRed === false && (
                <ITText className="text-xs" style={{ color: "var(--color-danger-600)" }}>
                  Desde este servidor no se llega al reloj: revisa que esté prendido y conectado a la red.
                </ITText>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <ITText as="span" muted className="block text-xs">
        {titulo}
      </ITText>
      <ITText as="span" className="text-sm font-medium" style={alerta ? { color: "var(--color-warning-700)" } : undefined}>
        {valor}
      </ITText>
    </div>
  );
}
