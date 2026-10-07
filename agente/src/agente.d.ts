export type Plataforma = "win32" | "darwin" | "linux";
export type NombreTarea = "actualizar" | "clonar" | "aplicar" | "respaldar" | "reiniciar" | "limpiar";
export type Servicio = "api" | "web" | "postgres";
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

export interface EstadoServidor {
  docker: "ok" | "apagado" | "desconocido";
  servicios: { servicio: Servicio; estado: string; salud: string; detalle: string }[];
  usoDocker: { tipo: string; tamano: string; recuperable: string }[];
  disco: { total: number; libre: number } | null;
}

export interface Reloj {
  serie: string;
  nombre: string | null;
  url: string | null;
  cuenta: boolean;
  sincronizado: string | null;
  checadas: number;
  ultima: string | null;
  enRed: boolean | null;
}

export interface Direccion {
  interfaz: string;
  ip: string;
  url: string;
  accesible: boolean;
}

export interface Campo {
  clave: string;
  valor: string;
  ayuda: string;
  secreto: boolean;
  soloLectura: boolean;
  /** No está en .env.example: alguien la agregó al .env a mano. */
  adicional?: boolean;
}

export interface ArchivoEnv {
  /** Si el .env todavía no existe (primera instalación) se muestra lo que se crearía. */
  existe: boolean;
  ruta: string;
  texto: string;
}

declare global {
  interface Window {
    agente: {
      estado: () => Promise<EstadoAgente>;
      herramientas: () => Promise<Herramienta[]>;
      resolverHerramienta: (id: string, estado: EstadoHerramienta) => Promise<{ ok: boolean; error?: string }>;
      abrirDescarga: (id: string, estado: EstadoHerramienta) => Promise<void>;
      elegirDestino: () => Promise<string | null>;
      usarExistente: () => Promise<{ carpeta: string | null; error?: string; actualizando?: boolean }>;
      clonar: (padre: string) => Promise<{ carpeta: string; yaExistia: boolean }>;
      leerConfiguracion: () => Promise<Campo[]>;
      guardarConfiguracion: (valores: Record<string, string>) => Promise<void>;
      leerEnv: () => Promise<ArchivoEnv>;
      guardarEnv: (texto: string) => Promise<void>;
      aplicarConfiguracion: () => Promise<void>;
      actualizar: () => Promise<void>;
      respaldar: () => Promise<void>;
      listarRespaldos: () => Promise<Respaldo[]>;
      abrirLogs: () => Promise<void>;
      abrirRespaldos: () => Promise<void>;
      revisarSalud: () => Promise<void>;
      estadoServidor: () => Promise<EstadoServidor>;
      relojes: () => Promise<Reloj[]>;
      direcciones: () => Promise<Direccion[]>;
      abrirWeb: (url?: string) => Promise<void>;
      reiniciar: (servicio: Servicio | "todo") => Promise<void>;
      limpiar: () => Promise<void>;
      verLogs: (servicio: Servicio) => Promise<void>;
      detenerLogs: () => Promise<void>;
      paqueteSoporte: () => Promise<string>;
      onLinea: (callback: (linea: string) => void) => () => void;
      onInicio: (callback: (tarea: NombreTarea) => void) => () => void;
      onLogs: (callback: (lineas: string[]) => void) => () => void;
      terminalCorrer: (comando: string) => Promise<void>;
      terminalDetener: () => Promise<void>;
      onTermInicio: (callback: (dato: { comando: string }) => void) => () => void;
      onTermSalida: (callback: (trozo: string) => void) => () => void;
      onTermFin: (callback: (dato: { comando: string; codigo: number }) => void) => () => void;
      onFin: (callback: (resultado: Resultado) => void) => () => void;
      onSalud: (callback: (enLinea: boolean) => void) => () => void;
    };
  }
}
