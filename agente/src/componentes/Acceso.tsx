import { ITBadget, ITButton, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { FaArrowUpRightFromSquare, FaArrowsRotate } from "react-icons/fa6";
import type { Direccion } from "../agente";

// Abrir la web aqui mismo y las direcciones (con QR) para otras PCs y celulares.
export default function Acceso() {
  const [direcciones, setDirecciones] = useState<Direccion[] | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const revisar = () => {
    setDirecciones(null);
    window.agente.direcciones().then((lista) => {
      setDirecciones(lista);
      setElegida((lista.find((d) => d.accesible) ?? lista[0])?.url ?? null);
    });
  };
  useEffect(revisar, []);

  // Solo con direcciones que responden: un QR que no abre nada confunde.
  const responde = direcciones?.find((d) => d.url === elegida)?.accesible;
  useEffect(() => {
    if (elegida && responde) QRCode.toDataURL(elegida, { margin: 1, width: 180 }).then(setQr);
    else setQr(null);
  }, [elegida, responde]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <ITText as="h3" className="font-semibold">
            Abrir Puerto Nuevo
          </ITText>
          <ITText muted className="text-xs">
            En esta computadora: http://localhost:8080
          </ITText>
        </div>
        <ITButton label="Abrir en el navegador" icon={<FaArrowUpRightFromSquare />} onClick={() => window.agente.abrirWeb()} />
      </div>

      <div className="flex items-center justify-between">
        <ITText as="h4" className="text-sm font-semibold">
          Desde otras computadoras o el celular
        </ITText>
        <ITButton label="Revisar" variant="text" size="sm" icon={<FaArrowsRotate />} onClick={revisar} disabled={!direcciones} />
      </div>

      {!direcciones && <ITLoader size="sm" />}
      {direcciones?.length === 0 && (
        <ITText muted className="text-sm">
          Esta computadora no está conectada a ninguna red.
        </ITText>
      )}
      {direcciones && direcciones.length > 0 && (
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <ul className="flex w-full flex-1 flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {direcciones.map((d) => (
              <li key={d.url}>
                <button
                  type="button"
                  onClick={() => setElegida(d.url)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${elegida === d.url ? "bg-slate-50" : ""}`}
                >
                  <div className="flex-1">
                    <ITText as="span" className="font-mono text-sm">
                      {d.url}
                    </ITText>
                    <ITText as="span" muted className="block text-xs">
                      {d.interfaz}
                    </ITText>
                  </div>
                  <ITBadget label={d.accesible ? "Responde" : "No responde"} color={d.accesible ? "success" : "danger"} size="sm" />
                </button>
              </li>
            ))}
          </ul>
          {qr && elegida && (
            <div className="flex flex-col items-center gap-1">
              <img src={qr} alt={`Código QR de ${elegida}`} className="h-[180px] w-[180px] rounded border border-slate-200" />
              <ITText muted className="text-xs">
                Escanéalo con el celular
              </ITText>
            </div>
          )}
        </div>
      )}
      {direcciones?.some((d) => !d.accesible) && (
        <ITText muted className="text-xs">
          «No responde» quiere decir que ni esta misma computadora llega a la web por esa dirección, así que las demás tampoco. Si Puerto Nuevo corre en WSL,
          hay que reenviar el puerto 8080 de Windows hacia WSL; revisa también el firewall. Pide ayuda a soporte.
        </ITText>
      )}
    </div>
  );
}
