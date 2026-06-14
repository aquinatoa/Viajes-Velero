import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

export type Role = "ADMIN" | "USER";

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
  authToken?: string;
}

// ── Hash de contraseña (scrypt, nativo de Node, sin dependencias) ───────────

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function publicUser(row: {
  id: string;
  email: string;
  name: string | null;
  role: string;
}): AuthedUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role as Role };
}

// ── Usuarios ────────────────────────────────────────────────────────────────

export async function createUser(input: {
  email: string;
  name?: string | null;
  password: string;
  role: Role;
}): Promise<AuthedUser> {
  const { hash, salt } = hashPassword(input.password);
  const row = await prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      name: input.name ?? null,
      passwordHash: hash,
      passwordSalt: salt,
      role: input.role as never,
    },
  });
  return publicUser(row);
}

export async function listUsers(): Promise<(AuthedUser & { isActive: boolean; createdAt: string })[]> {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({
    ...publicUser(row),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: Role; isActive?: boolean; password?: string },
): Promise<AuthedUser | null> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.password) {
    const { hash, salt } = hashPassword(patch.password);
    data.passwordHash = hash;
    data.passwordSalt = salt;
  }

  const row = await prisma.user.update({ where: { id }, data });
  // Si se desactiva o cambia la contraseña, invalidar sus sesiones.
  if (patch.isActive === false || patch.password) {
    await prisma.authToken.deleteMany({ where: { userId: id } });
  }
  return publicUser(row);
}

// ── Login / sesiones ─────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthedUser } | null> {
  const row = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!row || !row.isActive) return null;
  if (!verifyPassword(password, row.passwordHash, row.passwordSalt)) return null;

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.authToken.create({
    data: { token, userId: row.id, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  return { token, user: publicUser(row) };
}

export async function logout(token: string): Promise<void> {
  await prisma.authToken.deleteMany({ where: { token } });
}

async function getUserByToken(token: string): Promise<AuthedUser | null> {
  const row = await prisma.authToken.findUnique({ where: { token }, include: { user: true } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.authToken.delete({ where: { token } }).catch(() => undefined);
    return null;
  }
  if (!row.user.isActive) return null;
  return publicUser(row.user);
}

// ── Middleware ────────────────────────────────────────────────────────────────

function bearer(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function requireAuth(
  request: AuthedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearer(request);
  if (!token) {
    response.status(401).json({ error: "No autenticado.", code: "unauthenticated" });
    return;
  }
  const user = await getUserByToken(token);
  if (!user) {
    response.status(401).json({ error: "Sesión inválida o expirada.", code: "unauthenticated" });
    return;
  }
  request.user = user;
  request.authToken = token;
  next();
}

export function requireRole(...roles: Role[]) {
  return (request: AuthedRequest, response: Response, next: NextFunction): void => {
    if (!request.user) {
      response.status(401).json({ error: "No autenticado.", code: "unauthenticated" });
      return;
    }
    if (!roles.includes(request.user.role)) {
      response.status(403).json({ error: "No tienes permiso para esta acción.", code: "forbidden" });
      return;
    }
    next();
  };
}

// ── Auditoría ─────────────────────────────────────────────────────────────────

export async function writeAudit(input: {
  user?: AuthedUser | null;
  action: string;
  entity?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.user?.id ?? null,
        userEmail: input.user?.email ?? null,
        role: input.user?.role ?? null,
        action: input.action,
        entity: input.entity ?? null,
        detail: input.detail ?? null,
      },
    });
  } catch (error) {
    // La auditoría nunca debe romper la operación principal.
    console.error("No se pudo escribir el registro de auditoría", error);
  }
}

export async function listAuditLog(limit = 200) {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  return rows.map((row) => ({
    id: row.id,
    userEmail: row.userEmail,
    role: row.role,
    action: row.action,
    entity: row.entity,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ── Seed del primer admin desde .env ─────────────────────────────────────────

export async function ensureAdminFromEnv(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      "Auth: ADMIN_EMAIL/ADMIN_PASSWORD no definidos en .env; no se crea admin inicial.",
    );
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // No se sobreescribe la contraseña en cada arranque; solo se asegura admin activo.
    if (existing.role !== "ADMIN" || !existing.isActive) {
      await prisma.user.update({
        where: { email },
        data: { role: "ADMIN" as never, isActive: true },
      });
    }
    return;
  }
  const { hash, salt } = hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      name: "Administrador",
      passwordHash: hash,
      passwordSalt: salt,
      role: "ADMIN" as never,
    },
  });
  console.log(`Auth: admin inicial creado (${email}).`);
}
