import mongoose, { Schema, type Document } from 'mongoose';
import type { StaffRole } from '../../../../shared/rbac.ts';

export interface IAddressSnapshot {
  recipientName: string;
  phone: string;
  divisionCode: string;
  divisionName: string;
  districtCode: string;
  districtName: string;
  upazilaCode: string;
  upazilaName: string;
  areaCode: string;
  areaName: string;
  zone: 'dhaka_metro' | 'dhaka_suburb' | 'outside_dhaka';
  houseAddress: string;
  roadStreet?: string;
  landmark?: string;
  deliveryInstructions?: string;
}

export interface ISavedAddress extends IAddressSnapshot {
  _id: mongoose.Types.ObjectId;
  label: string;
  isDefault: boolean;
}

export type CustomerGender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  gender?: CustomerGender;
  passwordHash?: string;
  role: StaffRole;
  isActive: boolean;
  emailVerified: boolean;
  authProvider: 'local' | 'google' | 'facebook';
  providerId?: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  savedAddresses: ISavedAddress[];
  wishlist: mongoose.Types.ObjectId[];
  notificationPreferences: {
    orderUpdates: boolean;
    promotions: boolean;
    backInStock: boolean;
  };
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  verificationTokenHash?: string;
  tokenVersion: number;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SavedAddressSchema = new Schema<ISavedAddress>(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    recipientName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 25 },
    divisionCode: { type: String, required: true },
    divisionName: { type: String, required: true },
    districtCode: { type: String, required: true },
    districtName: { type: String, required: true },
    upazilaCode: { type: String, required: true },
    upazilaName: { type: String, required: true },
    areaCode: { type: String, required: true },
    areaName: { type: String, required: true },
    zone: {
      type: String,
      enum: ['dhaka_metro', 'dhaka_suburb', 'outside_dhaka'],
      required: true,
    },
    houseAddress: { type: String, required: true, trim: true, maxlength: 200 },
    roadStreet: { type: String, trim: true, maxlength: 120 },
    landmark: { type: String, trim: true, maxlength: 120 },
    deliveryInstructions: { type: String, trim: true, maxlength: 240 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, maxlength: 25 },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
      default: undefined,
    },
    passwordHash: { type: String, select: false },
    role: {
      type: String,
      enum: [
        'customer',
        'super_admin',
        'admin',
        'order_manager',
        'inventory_manager',
        'catalog_manager',
        'customer_support',
        'finance_accounts',
      ],
      default: 'customer',
      index: true,
    },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    authProvider: { type: String, enum: ['local', 'google', 'facebook'], default: 'local' },
    providerId: { type: String },
    avatarUrl: { type: String },
    avatarPublicId: { type: String },
    savedAddresses: { type: [SavedAddressSchema], default: [] },
    wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    notificationPreferences: {
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
      backInStock: { type: Boolean, default: true },
    },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    verificationTokenHash: { type: String, select: false },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export interface INotificationRecord extends Document {
  userId?: mongoose.Types.ObjectId;
  email: string;
  type:
    | 'verification'
    | 'password_reset'
    | 'order_confirmation'
    | 'payment_status'
    | 'shipment_update'
    | 'refund_update'
    | 'back_in_stock'
    | 'marketing';
  subject: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped_unconfigured';
  providerMessageId?: string;
  errorMessage?: string;
  attempts: number;
  createdAt: Date;
}

const NotificationRecordSchema = new Schema<INotificationRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    type: {
      type: String,
      enum: [
        'verification',
        'password_reset',
        'order_confirmation',
        'payment_status',
        'shipment_update',
        'refund_update',
        'back_in_stock',
        'marketing',
      ],
      required: true,
    },
    subject: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'skipped_unconfigured'],
      default: 'queued',
    },
    providerMessageId: { type: String },
    errorMessage: { type: String },
    attempts: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const NotificationRecordModel =
  mongoose.models.NotificationRecord ||
  mongoose.model<INotificationRecord>('NotificationRecord', NotificationRecordSchema);
