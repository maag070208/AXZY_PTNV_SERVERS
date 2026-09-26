import { useCallback, useEffect, useState } from "react";
import type { Herramienta } from "./agente";

export function useHerramientas() {
  const [herramientas, setHerramientas] = useState<Herramienta[] | null>(null);
  const [revisando, setRevisando] = useState(false);

  const revisar = useCallback(async () => {
    setRevisando(true);
    try {
      setHerramientas(await window.agente.herramientas());
    } finally {
      setRevisando(false);
    }
  }, []);

  useEffect(() => {
    revisar();
  }, [revisar]);

  const todoListo = !!herramientas?.length && herramientas.every((h) => h.estado === "ok");
  return { herramientas, revisando, revisar, todoListo };
}
