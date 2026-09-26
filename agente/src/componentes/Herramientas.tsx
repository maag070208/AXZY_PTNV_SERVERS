import { ITAlert, ITBadget, ITButton, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { useState } from "react";
import { FaArrowsRotate, FaCopy, FaDownload, FaTerminal } from "react-icons/fa6";
import type { EstadoHerramienta, Herramienta } from "../agente";

const ETIQUETA: Record<EstadoHerramienta, { texto: string; color: "success" | "danger" | "warning" }> = {
  ok: { texto: "Instalado", color: "success" },
  falta: { texto: "No instalado", color: "danger" },
  apagado: { texto: "Instalado, apagado", color: "warning" },
  permiso: { texto: "Sin permiso", color: "warning" },
};

interface Props {
  herramientas: Herramienta[] | null;
  revisando: boolean;
  onRevisar: () => void;
}

// Lista de herramientas necesarias con su estado y como resolver las que faltan.
export default function Herramientas({ herramientas, revisando, onRevisar }: Props) {
  const [error, setError] = useState<string | null>(null);

  const resolver = async (h: Herramienta) => {
    setError(null);
    const resultado = await window.agente.resolverHerramienta(h.id, h.estado);
    if (!resultado.ok) setError(resultado.error ?? null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <ITText as="h3" className="font-semibold">
          Herramientas
        </ITText>
        <ITButton label={revisando ? "Revisando…" : "Revisar de nuevo"} variant="text" size="sm" icon={<FaArrowsRotate />} onClick={onRevisar} disabled={revisando} />
      </div>

      {!herramientas && (
        <div className="flex items-center gap-3 py-4">
          <ITLoader size="sm" />
          <ITText muted className="text-sm">
            Revisando qué hay instalado…
          </ITText>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
        {herramientas?.map((h) => (
          <li key={h.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <ITText as="span" className="flex-1 text-sm font-medium">
                {h.nombre}
                {h.detalle && (
                  <ITText as="span" muted className="ml-2 text-xs">
                    {h.detalle}
                  </ITText>
                )}
              </ITText>
              <ITBadget label={ETIQUETA[h.estado].texto} color={ETIQUETA[h.estado].color} size="sm" />
            </div>
            {h.ayuda && (
              <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3">
                <ITText className="text-xs">{h.ayuda.texto}</ITText>
                {h.ayuda.comando && <Comando comando={h.ayuda.comando} />}
                <div className="flex flex-wrap gap-2">
                  {(h.ayuda.comando || h.ayuda.abrirDocker) && (
                    <ITButton
                      label={h.estado === "apagado" ? "Arrancar" : h.ayuda.comando ? "Abrir terminal e instalar" : "Abrir"}
                      icon={<FaTerminal />}
                      size="sm"
                      onClick={() => resolver(h)}
                    />
                  )}
                  {h.ayuda.url && (
                    <ITButton label="Página de descarga" icon={<FaDownload />} size="sm" variant="outlined" onClick={() => window.agente.abrirDescarga(h.id, h.estado)} />
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && <ITAlert variant="error">{error}</ITAlert>}
      {herramientas?.some((h) => h.estado !== "ok") && (
        <ITText muted className="text-xs">
          Cuando termines de instalar, presiona «Revisar de nuevo».
        </ITText>
      )}
    </div>
  );
}

function Comando({ comando }: { comando: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    await navigator.clipboard.writeText(comando);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 rounded bg-slate-900 px-3 py-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-100">{comando}</code>
      <button type="button" onClick={copiar} className="text-slate-300 hover:text-white" title="Copiar comando" aria-label="Copiar comando">
        {copiado ? <ITText as="span" className="text-xs" style={{ color: "inherit" }}>Copiado</ITText> : <FaCopy />}
      </button>
    </div>
  );
}
