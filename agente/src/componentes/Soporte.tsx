import { ITAlert, ITButton, ITText } from "@axzydev/axzy_ui_system";
import { useState } from "react";
import { FaLifeRing } from "react-icons/fa6";

// Arma el .zip para soporte y lo deja seleccionado en el explorador de archivos.
export default function Soporte({ compacto }: { compacto?: boolean }) {
  const [generando, setGenerando] = useState(false);
  const [zip, setZip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      setZip(await window.agente.paqueteSoporte());
    } catch (e) {
      setError(String(e).replace(/^Error: Error invoking remote method '[^']+': (Error: )?/, ""));
    } finally {
      setGenerando(false);
    }
  };

  const boton = <ITButton label={generando ? "Juntando información…" : "Mandar a soporte"} icon={<FaLifeRing />} variant={compacto ? "outlined" : undefined} onClick={generar} disabled={generando} />;
  if (compacto) return boton;

  return (
    <div className="flex flex-col gap-3">
      <ITText as="h3" className="font-semibold">
        Soporte
      </ITText>
      <ITText muted className="text-sm">
        Junta en un .zip los logs, el estado de los servidores, las versiones y el espacio en disco. No incluye las contraseñas del .env. Se abre la carpeta
        con el archivo seleccionado: arrástralo a WhatsApp o al correo.
      </ITText>
      <div>{boton}</div>
      {zip && (
        <ITAlert variant="success" title="Listo">
          <span className="break-all">{zip}</span>
        </ITAlert>
      )}
      {error && <ITAlert variant="error">{error}</ITAlert>}
    </div>
  );
}
