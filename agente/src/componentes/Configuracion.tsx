import { ITAlert, ITButton, ITInput, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { type ChangeEvent, useEffect, useState } from "react";
import { FaFloppyDisk } from "react-icons/fa6";
import type { Campo } from "../agente";

interface Props {
  onGuardado: () => void;
  textoBoton?: string;
}

// Formulario del .env. Los campos y su ayuda vienen de .env.example.
export default function Configuracion({ onGuardado, textoBoton = "Guardar configuración" }: Props) {
  const [campos, setCampos] = useState<Campo[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.agente
      .leerConfiguracion()
      .then((leidos) => {
        setCampos(leidos);
        setValores(Object.fromEntries(leidos.map((c) => [c.clave, c.valor])));
      })
      .catch((e) => setError(String(e)));
  }, []);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await window.agente.guardarConfiguracion(valores);
      onGuardado();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (error && !campos) return <ITAlert variant="error">{error}</ITAlert>;
  if (!campos) return <ITLoader size="md" />;

  return (
    <div className="flex flex-col gap-4">
      <ITText muted className="text-sm">
        Se guarda en el archivo <code>.env</code>. Las contraseñas de la base y de las sesiones ya vienen generadas; lo demás pídelo a soporte si no lo
        tienes (puedes dejarlo vacío y llenarlo después).
      </ITText>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {campos.map((campo) => (
          <div key={campo.clave} className="flex flex-col gap-1">
            <ITInput
              name={campo.clave}
              label={campo.clave}
              type={campo.secreto ? "password" : "text"}
              value={valores[campo.clave] ?? ""}
              readOnly={campo.soloLectura}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setValores((v) => ({ ...v, [campo.clave]: e.target.value }))}
            />
            {(campo.soloLectura || campo.ayuda) && (
              <ITText muted className="text-xs">
                {campo.soloLectura ? "No se puede cambiar: la base de datos ya se creó con esta contraseña." : campo.ayuda}
              </ITText>
            )}
          </div>
        ))}
      </div>
      {error && <ITAlert variant="error">{error}</ITAlert>}
      <div className="flex justify-end">
        <ITButton label={guardando ? "Guardando…" : textoBoton} icon={<FaFloppyDisk />} onClick={guardar} disabled={guardando} />
      </div>
    </div>
  );
}
