import { useEffect, useState } from "react";
import type { NombreTarea, Resultado } from "./agente";

export type Fase = "libre" | "corriendo" | "ok" | "error";

export interface Paso {
  n: number;
  titulo: string;
}

// actualizar.sh marca cada paso como "==> [n/total] Titulo".
const PATRON_PASO = /^==> \[(\d+)\/(\d+)\] (.+)$/;
const MAX_LINEAS = 3000;

// Estado de la tarea larga que corre el proceso principal (solo hay una a la vez).
export function useTarea(alTerminar?: (resultado: Resultado) => void) {
  const [nombre, setNombre] = useState<NombreTarea | null>(null);
  const [fase, setFase] = useState<Fase>("libre");
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [total, setTotal] = useState(0);
  const [lineas, setLineas] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const limpiar = (tarea: NombreTarea) => {
    setNombre(tarea);
    setPasos([]);
    setTotal(0);
    setLineas([]);
    setAvisos([]);
    setError(null);
    setFase("corriendo");
  };

  useEffect(() => {
    const quitar = [
      // Tambien llegan las que arrancan desde la bandeja o al iniciar sesion.
      window.agente.onInicio(limpiar),
      window.agente.onLinea((linea) => {
        setLineas((previas) => [...previas.slice(-MAX_LINEAS), linea]);
        const paso = PATRON_PASO.exec(linea);
        if (paso) {
          setTotal(Number(paso[2]));
          setPasos((previos) => [...previos, { n: Number(paso[1]), titulo: paso[3] }]);
        } else if (linea.startsWith("ERROR:")) {
          setError(linea.slice(6).trim());
        } else if (linea.startsWith("AVISO:")) {
          setAvisos((previos) => [...previos, linea.slice(6).trim()]);
        } else if (/^fatal: /.test(linea)) {
          setError(linea); // errores de git clone
        }
      }),
      window.agente.onFin((resultado) => {
        setFase(resultado.ok ? "ok" : "error");
        setError((previo) => previo ?? (resultado.ok ? null : "La tarea terminó con error. Revisa el detalle técnico."));
        alTerminar?.(resultado);
      }),
    ];
    return () => quitar.forEach((fn) => fn());
  }, [alTerminar]);

  // Limpia el estado y lanza la tarea; si ni siquiera arranca, queda como error.
  const iniciar = async <T,>(tarea: NombreTarea, lanzar: () => Promise<T>): Promise<T | undefined> => {
    limpiar(tarea);
    try {
      return await lanzar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
      setFase("error");
    }
  };

  const reiniciar = () => {
    setNombre(null);
    setFase("libre");
  };

  const actual = pasos.at(-1);
  const avance = fase === "ok" ? 100 : total && actual ? ((actual.n - 1) / total) * 100 : 3;

  return { nombre, fase, pasos, total, actual, avance, lineas, avisos, error, iniciar, reiniciar, setFase };
}

export type Tarea = ReturnType<typeof useTarea>;
