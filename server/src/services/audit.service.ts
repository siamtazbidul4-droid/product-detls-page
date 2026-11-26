import type mongoose from 'mongoose';
import { AuditLogModel } from '../modules/support/support.model.ts';

export async function recordAuditLog(params: {
  actorId?: mongoose.Types.ObjectId | string | null;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await AuditLogModel.create({
      actorId: params.actorId || null,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details,
      ipAddress: params.ipAddress,
    });
  } catch (err) {
    console.error('[Audit] Failed to persist audit log:', err instanceof Error ? err.message : err);
  }
}
