import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.ts';

export interface DatabaseStatus {
  connected: boolean;
  configured: boolean;
  readyState: number;
  error: string | null;
  supportsTransactions: boolean;
}

const state: {
  error: string | null;
  supportsTransactions: boolean;
} = {
  error: null,
  supportsTransactions: false,
};

export async function connectDatabase(): Promise<boolean> {
  if (!env.mongodbUri) {
    state.error = 'MONGODB_URI environment variable is not configured.';
    console.warn('[DB] MONGODB_URI is not set. Persistent API routes will return 503 until MongoDB Atlas is configured.');
    return false;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    });
    state.error = null;

    // Detect replica set support (Atlas clusters support transactions; standalone servers do not)
    try {
      const adminDb = mongoose.connection.db?.admin();
      if (adminDb) {
        const hello = await adminDb.command({ hello: 1 });
        state.supportsTransactions = Boolean(hello.setName || hello.msg === 'isdbgrid');
      }
    } catch {
      state.supportsTransactions = false;
    }

    console.log(
      `[DB] Connected to MongoDB Atlas (transactions: ${state.supportsTransactions ? 'enabled' : 'atomic-fallback'})`
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect to MongoDB Atlas';
    state.error = message;
    console.error('[DB] MongoDB Atlas connection failed:', message);
    return false;
  }
}

export function getDatabaseStatus(): DatabaseStatus {
  const readyState = mongoose.connection.readyState;
  return {
    connected: readyState === 1,
    configured: Boolean(env.mongodbUri),
    readyState,
    error: readyState === 1 ? null : state.error || 'MongoDB Atlas is disconnected.',
    supportsTransactions: state.supportsTransactions,
  };
}

export function requireDatabase(_req: Request, res: Response, next: NextFunction): void {
  const status = getDatabaseStatus();
  if (!status.connected) {
    res.status(503).json({
      error: 'Database unavailable',
      code: 'DB_UNAVAILABLE',
      message: status.configured
        ? `MongoDB Atlas connection unavailable: ${status.error}`
        : 'MONGODB_URI is not configured. Please connect MongoDB Atlas in your environment configuration.',
    });
    return;
  }
  next();
}
