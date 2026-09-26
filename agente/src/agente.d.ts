export type Plataforma = "win32" | "darwin" | "linux";
export type NombreTarea = "actualizar" | "clonar" | "aplicar" | "respaldar";
export type EstadoHerramienta = "ok" | "falta" | "apagado" | "permiso";

export interface Resultado {
  tarea: NombreTarea;
  ok: boolean;
  fecha: string;
}

export interface EstadoAgente {
  plataforma: Plataforma;
  carpeta: string | null;
  instalado: boolean;
  ultima: { ok: boolean; fecha: string } | null;
  tarea: NombreTarea | null;
  carpetaSugerida: string;
}

export interface Herramienta {
  id: string;
  nombre: string;
  estado: EstadoHerramienta;
  detalle: string;
  ayuda: { texto: string; url?: string; comando?: string; abrirDocker?: boolean } | null;
}

export interface Respaldo {
  nombre: string;
  fecha: string;
  bytes: number;
}

export interface Campo {
  clave: string;
  valor: string;
  ayuda: string;
  secreto: boolean;
  soloLectura: boolean;
}

declare global {
  interface Window {
    agente: {
      estado: () => Promise<EstadoAgente>;
      herramientas: () => Promise<Herramienta[]>;
      resolverHerramienta: (id: string, estado: EstadoHerramienta) => Promise<{ ok: boolean; error?: string }>;
      abrirDescarga: (id: string, estado: EstadoHerramienta) => Promise<void>;
      elegirDestino: () => Promise<string | null>;
      usarExistente: () => Promise<{ carpeta: string | null; error?: string }>;
      clonar: (padre: string) => Promise<{ carpeta: string; yaExistia: boolean }>;
      leerConfiguracion: () => Promise<Campo[]>;
      guardarConfiguracion: (valores: Record<string, string>) => Promise<void>;
      aplicarConfiguracion: () => Promise<void>;
      actualizar: () => Promise<void>;
      respaldar: () => Promise<void>;
      listarRespaldos: () => Promise<Respaldo[]>;
      abrirLogs: () => Promise<void>;
      abrirRespaldos: () => Promise<void>;
      revisarSalud: () => Promise<void>;
      onLinea: (callback: (linea: string) => void) => () => void;
      onFin: (callback: (resultado: Resultado) => void) => () => void;
      onSalud: (callback: (enLinea: boolean) => void) => () => void;
    };
  }
}
