import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.ts';

interface HttpError extends Error {
  statusCode?: number;
  code?: string | number;
  keyPattern?: Record<string, number>;
}

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      message: err.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`).join('; '),
      issues: err.issues,
    });
    return;
  }

  // Mongoose duplicate key error (e.g., SKU or slug uniqueness)
  if (err.code === 11000) {
    const duplicateFields = err.keyPattern ? Object.keys(err.keyPattern).join(', ') : 'unique field';
    res.status(409).json({
      error: 'Duplicate conflict',
      code: 'DUPLICATE_KEY',
      message: `A record with the same ${duplicateFields} already exists.`,
    });
    return;
  }

  if (err.name === 'CastError') {
    res.status(400).json({
      error: 'Invalid identifier format',
      code: 'INVALID_ID',
    });
    return;
  }

  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (statusCode >= 500) {
    console.error('[API Error]', err.message, env.isProd ? '' : err.stack);
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : err.message,
    code: typeof err.code === 'string' ? err.code : 'REQUEST_ERROR',
    message: statusCode >= 500 && env.isProd ? 'Something went wrong. Please try again.' : err.message,
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
