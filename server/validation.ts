/**
 * Validación de payloads de la API con zod.
 *
 * `parseBody` valida `request.body` contra un esquema y, si falla, responde
 * 400 con un mensaje legible y devuelve null (el handler debe cortar con
 * `if (!data) return;`). Si pasa, devuelve los datos ya tipados y saneados.
 *
 * Por ahora se aplica a los endpoints de autenticación (entrada sensible y de
 * forma estable). Los esquemas usan el comportamiento por defecto de zod
 * (descarta claves desconocidas), así que no rompen clientes que envíen campos
 * extra. Ampliar a más endpoints de forma incremental.
 */
import { z } from "zod";
import type { Request, Response } from "express";

export function parseBody<T>(
  schema: z.ZodType<T>,
  request: Request,
  response: Response,
): T | null {
  const result = schema.safeParse(request.body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    const message = first
      ? path
        ? `${path}: ${first.message}`
        : first.message
      : "Datos no válidos.";
    response.status(400).json({ error: message });
    return null;
  }
  return result.data;
}

const roleSchema = z.enum(["ADMIN", "USER"]);
const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.");

// Login: deliberadamente laxo (solo no vacío) para no bloquear credenciales
// existentes; la verificación real la hace el backend contra la BD.
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email y contraseña son obligatorios."),
  password: z.string().min(1, "Email y contraseña son obligatorios."),
});

// Alta de usuario: el email sí se valida con formato (es un usuario nuevo).
export const createUserSchema = z.object({
  email: z.string().trim().min(1, "El email es obligatorio.").email("El email no es válido."),
  name: z.string().trim().optional(),
  password: passwordSchema,
  role: roleSchema.optional(),
});

// Edición de usuario: todos los campos opcionales (patch parcial).
export const updateUserSchema = z.object({
  name: z.string().trim().optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});
