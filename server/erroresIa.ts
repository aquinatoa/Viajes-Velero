/**
 * Qué se le dice a la persona cuando el proveedor de IA rechaza una lectura.
 *
 * Hasta ahora todos los 400 se traducían a «La solicitud al proveedor IA no es
 * válida (revisa el modelo o el tamaño del documento)». El 25/09/2026 la cuenta
 * de Anthropic se quedó sin saldo; el proveedor lo decía con todas las letras
 * —«Your credit balance is too low»— y la aplicación lo convirtió en esa frase.
 * Once días mirando el modelo y el tamaño del documento.
 *
 * La regla aquí es una sola: **el motivo del proveedor se conserva**. Se
 * traduce lo que se sabe traducir, se añade qué hacer cuando se sabe, y el
 * texto original va detrás, siempre. Una frase genérica solo cuando no hay nada
 * mejor.
 *
 * Es una función pura sobre {estado, mensaje, tipo} para poder probarla sin el
 * SDK y sin red.
 */

export interface ErrorDelProveedor {
  /** HTTP del proveedor, si lo hubo. */
  estado?: number | null;
  /** El mensaje literal del proveedor. */
  mensaje?: string | null;
  /** Nombre de la clase de error del SDK, si se conoce. */
  tipo?: string | null;
}

export interface MensajeDeError {
  /** Lo que se enseña. */
  texto: string;
  /** Qué tiene que hacer alguien para arreglarlo, cuando se sabe. */
  accion?: string;
  /** Etiqueta corta para agrupar incidencias: SIN_SALDO, CLAVE, MODELO, PETICION, LIMITE, PROVEEDOR, RED. */
  motivo: string;
}

/** El texto del proveedor, limpio de JSON y de ruido, para pegarlo detrás. */
function literalDelProveedor(mensaje: string | null | undefined): string {
  if (!mensaje) return "";
  // El SDK suele traer `400 {"type":"error","error":{"type":"...","message":"..."}}`.
  const m = /"message"\s*:\s*"([^"]+)"/.exec(mensaje);
  const texto = (m ? m[1] : mensaje).replace(/\s+/g, " ").trim();
  return texto.length > 300 ? texto.slice(0, 299) + "…" : texto;
}

export function mensajeDeErrorDelProveedor(error: ErrorDelProveedor): MensajeDeError {
  const literal = literalDelProveedor(error.mensaje);
  const bajo = literal.toLowerCase();
  const con = (texto: string) => (literal ? `${texto} El proveedor dijo: «${literal}».` : texto);

  // Sin saldo. Es un 400 con un texto inconfundible; va antes que cualquier
  // otra lectura del 400 porque no se arregla tocando nada de la aplicación.
  if (/credit balance|insufficient (credits|funds)|purchase credits|plans & billing/.test(bajo)) {
    return {
      motivo: "SIN_SALDO",
      texto: con("La cuenta de Anthropic no tiene saldo: el documento no se ha leído."),
      accion:
        "Recargar la cuenta en la consola de Anthropic (Plans & Billing) y volver a lanzar la lectura. No hace falta subir el documento otra vez.",
    };
  }

  if (error.estado === 401 || error.tipo === "AuthenticationError") {
    return {
      motivo: "CLAVE",
      texto: con("La clave de API de Anthropic no es válida."),
      accion: "Revisar ANTHROPIC_API_KEY en el .env del servidor.",
    };
  }
  if (error.estado === 403 || error.tipo === "PermissionDeniedError") {
    return {
      motivo: "CLAVE",
      texto: con("La clave de API de Anthropic no tiene permiso para el modelo solicitado."),
      accion: "Revisar AI_MODEL o los permisos de la clave en la consola de Anthropic.",
    };
  }
  if (error.estado === 404 || error.tipo === "NotFoundError") {
    return {
      motivo: "MODELO",
      texto: con("El modelo indicado en AI_MODEL no existe o no está disponible."),
      accion: "Revisar AI_MODEL en el .env del servidor.",
    };
  }
  if (error.estado === 429 || error.tipo === "RateLimitError") {
    return {
      motivo: "LIMITE",
      texto: con("El proveedor ha limitado el uso: demasiadas peticiones o demasiados tokens en poco tiempo."),
      accion: "Esperar unos minutos y volver a lanzar la lectura.",
    };
  }
  if (error.estado === 400 || error.tipo === "BadRequestError") {
    return {
      motivo: "PETICION",
      texto: con("El proveedor ha rechazado la petición."),
      accion: literal
        ? undefined
        : "Revisar el modelo configurado y el tamaño del documento.",
    };
  }
  if (typeof error.estado === "number" && error.estado >= 500) {
    return {
      motivo: "PROVEEDOR",
      texto: con(`El proveedor ha devuelto un error (${error.estado}).`),
      accion: "Volver a intentarlo pasados unos minutos.",
    };
  }
  if (typeof error.estado === "number") {
    return { motivo: "PROVEEDOR", texto: con(`El proveedor ha devuelto un error (${error.estado}).`) };
  }
  return {
    motivo: "RED",
    texto: con("No se pudo conectar con el proveedor de IA (Anthropic)."),
    accion: "Revisar la conexión del servidor.",
  };
}
