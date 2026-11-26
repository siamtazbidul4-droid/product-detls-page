import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { UserModel, type IUser } from '../modules/users/user.model.ts';
import { hasPermission, isStaffRole, type Permission, type StaffRole } from '../../../shared/rbac.ts';

export interface AuthJwtPayload {
  sub: string;
  role: StaffRole;
  tv?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  authPayload?: AuthJwtPayload;
}

export const AUTH_COOKIE_NAME = 'novara_token';

export function signAuthToken(userId: string, role: StaffRole, tokenVersion = 0): string {
  return jwt.sign({ sub: userId, role, tv: tokenVersion }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export function isCsrfSafeRequest(req: Request): boolean {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return true;
  }
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const hasRequestedWith = Boolean(req.headers['x-requested-with']);
  let originMatchesHost = false;
  if (origin && host) {
    try {
      originMatchesHost = new URL(origin).host === String(host).split(',')[0].trim();
    } catch {
      originMatchesHost = false;
    }
  }
  return originMatchesHost || hasRequestedWith;
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractAuthToken(req);
    if (!token) {
      next();
      return;
    }
    const decoded = jwt.verify(token, env.jwtSecret) as AuthJwtPayload;
    const user = await UserModel.findById(decoded.sub);
    if (user && user.isActive && (decoded.tv ?? 0) === (user.tokenVersion ?? 0)) {
      req.user = user;
      req.authPayload = decoded;
    }
  } catch {
    // Invalid or expired token treated as unauthenticated for optionalAuth
  }
  next();
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractAuthToken(req);
    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        message: 'Please sign in to continue.',
      });
      return;
    }

    const decoded = jwt.verify(token, env.jwtSecret) as AuthJwtPayload;
    const user = await UserModel.findById(decoded.sub);
    if (!user || !user.isActive || (decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      res.status(401).json({
        error: 'Account unavailable',
        code: 'AUTH_INVALID',
        message: 'Your session is invalid or expired. Please sign in again.',
      });
      return;
    }

    // For cookie-authenticated state-changing requests, enforce same-origin or custom header check
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (isMutation && !isCsrfSafeRequest(req)) {
      res.status(403).json({
        error: 'CSRF verification failed',
        code: 'CSRF_BLOCKED',
      });
      return;
    }

    req.user = user;
    req.authPayload = decoded;
    next();
  } catch {
    res.status(401).json({
      error: 'Invalid or expired session',
      code: 'TOKEN_EXPIRED',
      message: 'Please sign in again.',
    });
  }
}

export function requireStaff(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || !isStaffRole(req.user.role)) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'STAFF_ONLY',
      message: 'Staff authorization is required for this resource.',
    });
    return;
  }
  next();
}

export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
        message: `Required permission: ${permission}`,
      });
      return;
    }
    next();
  };
}
