import mongoose, { Schema, type Document } from 'mongoose';

export interface INewsletterSubscription extends Document {
  email: string;
  status: 'subscribed' | 'unsubscribed';
  consentRecordedAt: Date;
  unsubscribedAt?: Date | null;
  unsubscribeToken: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSubscriptionSchema = new Schema<INewsletterSubscription>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    status: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed', index: true },
    consentRecordedAt: { type: Date, required: true },
    unsubscribedAt: { type: Date, default: null },
    unsubscribeToken: { type: String, required: true },
    source: { type: String, default: 'homepage_newsletter' },
  },
  { timestamps: true }
);

export const NewsletterSubscriptionModel =
  mongoose.models.NewsletterSubscription ||
  mongoose.model<INewsletterSubscription>('NewsletterSubscription', NewsletterSubscriptionSchema);

export interface ISupportEnquiry extends Document {
  ticketNumber: string;
  userId?: mongoose.Types.ObjectId | null;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  orderNumber?: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedStaffId?: mongoose.Types.ObjectId | null;
  internalNotes: Array<{
    note: string;
    actorName: string;
    actorId: mongoose.Types.ObjectId;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const SupportEnquirySchema = new Schema<ISupportEnquiry>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, maxlength: 25 },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    orderNumber: { type: String, trim: true, maxlength: 40 },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    assignedStaffId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    internalNotes: [
      {
        note: { type: String, required: true },
        actorName: { type: String, required: true },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const SupportEnquiryModel =
  mongoose.models.SupportEnquiry ||
  mongoose.model<ISupportEnquiry>('SupportEnquiry', SupportEnquirySchema);

export interface IAuditLog extends Document {
  actorId?: mongoose.Types.ObjectId | null;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorEmail: { type: String },
    actorRole: { type: String },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: String, index: true },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

export const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
