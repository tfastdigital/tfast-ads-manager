/**
 * Auth — minimal JWT (HS256, hand-rolled, zero deps) + RBAC.
 * Session resolution is server-side; tenant values NEVER come from
 * client input.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const ROLES = ['owner', 'admin', 'media_buyer', 'analyst', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = { viewer: 0, analyst: 1, media_buyer: 2, admin: 3, owner: 4 };

export interface Session {
  user_id: string;
  agency_id: string;
  client_id?: string; // present for client-scoped tokens
  role: Role;
}

const SessionSchema = z.object({
  user_id: z.string().uuid(),
  agency_id: z.string().uuid(),
  client_id: z.string().uuid().optional(),
  role: z.enum(ROLES),
  exp: z.number(),
});

const SECRET = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
if (SECRET === 'dev-insecure-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}

const b64url = (buf: Buffer) => buf.toString('base64url');

export function signToken(payload: Omit<Session, 'exp'>, ttlSeconds = 8 * 3600): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(
    Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })),
  );
  const sig = createHmac('sha256', SECRET).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

export function verifyToken(token: string): Session | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', SECRET).update(`${header}.${body}`).digest();
  const provided = Buffer.from(sig, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const parsed = SessionSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')));
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    const { exp: _exp, ...session } = parsed;
    void _exp;
    return session;
  } catch {
    return null;
  }
}

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

export function verifyPassword(password: string, encoded: string | null): boolean {
  if (!encoded) return false;
  const [scheme, saltText, hashText] = encoded.split(':');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    session?: Session;
  }
}
