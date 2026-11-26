import mongoose, { Schema, type Document } from 'mongoose';
import type { IAddressSnapshot } from '../users/user.model.ts';
import type {
  FulfillmentState,
  OrderLifecycleStatus,
  PaymentState,
} from '../../../../shared/orderStateMachine.ts';

export interface IOrderLineSnapshot {
  productId: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId | null;
  sku: string;
  productName: string;
  variantTitle?: string;
  selectedOptions?: Record<string, string>;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice?: number | null;
  lineTotal: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  idempotencyKey?: string;
  userId: mongoose.Types.ObjectId;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerGender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  items: IOrderLineSnapshot[];
  shippingAddress: IAddressSnapshot;
  deliveryMethod: 'standard' | 'express';
  paymentMethod: 'cod' | 'sslcommerz';
  paymentChannel?: 'cod' | 'card' | 'bkash' | 'nagad';
  transactionRef?: string;
  termsAccepted: boolean;
  termsAcceptedAt?: Date;
  policyVersion?: string;
  orderStatus: OrderLifecycleStatus;
  paymentStatus: PaymentState;
  fulfillmentStatus: FulfillmentState;
  subtotal: number;
  discountAmount: number;
  couponCode?: string | null;
  shippingCharge: number;
  taxAmount: number;
  totalAmount: number;
  trackingNumber?: string;
  courierName?: string;
  customerNote?: string;
  staffNotes: Array<{
    note: string;
    actorName: string;
    actorId: mongoose.Types.ObjectId;
    createdAt: Date;
  }>;
  statusHistory: Array<{
    status: OrderLifecycleStatus;
    paymentStatus?: PaymentState;
    fulfillmentStatus?: FulfillmentState;
    note?: string;
    actorId?: mongoose.Types.ObjectId;
    actorRole?: string;
    createdAt: Date;
  }>;
  deliveredAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, sparse: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerGender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
      default: undefined,
    },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: { type: Schema.Types.ObjectId, default: null },
        sku: { type: String, required: true },
        productName: { type: String, required: true },
        variantTitle: { type: String },
        selectedOptions: { type: Map, of: String },
        imageUrl: { type: String },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        originalUnitPrice: { type: Number, default: null },
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],
    shippingAddress: {
      recipientName: { type: String, required: true },
      phone: { type: String, required: true },
      divisionCode: { type: String, required: true },
      divisionName: { type: String, required: true },
      districtCode: { type: String, required: true },
      districtName: { type: String, required: true },
      upazilaCode: { type: String, required: true },
      upazilaName: { type: String, required: true },
      areaCode: { type: String, required: true },
      areaName: { type: String, required: true },
      zone: { type: String, enum: ['dhaka_metro', 'dhaka_suburb', 'outside_dhaka'], required: true },
      houseAddress: { type: String, required: true },
      roadStreet: { type: String },
      landmark: { type: String },
      deliveryInstructions: { type: String },
    },
    deliveryMethod: { type: String, enum: ['standard', 'express'], default: 'standard' },
    paymentMethod: { type: String, enum: ['cod', 'sslcommerz'], required: true, index: true },
    paymentChannel: { type: String, enum: ['cod', 'card', 'bkash', 'nagad'], default: 'cod' },
    transactionRef: { type: String, index: true },
    termsAccepted: { type: Boolean, default: true },
    termsAcceptedAt: { type: Date },
    policyVersion: { type: String, default: '2026-01' },
    orderStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'packed',
        'shipped',
        'delivered',
        'cancelled',
        'payment_failed',
        'return_requested',
        'returned',
        'refund_pending',
        'refunded',
      ],
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'failed', 'refund_pending', 'refunded'],
      default: 'unpaid',
      index: true,
    },
    fulfillmentStatus: {
      type: String,
      enum: ['unfulfilled', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'unfulfilled',
    },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: null },
    shippingCharge: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    trackingNumber: { type: String },
    courierName: { type: String },
    customerNote: { type: String, maxlength: 400 },
    staffNotes: [
      {
        note: { type: String, required: true },
        actorName: { type: String, required: true },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    statusHistory: [
      {
        status: { type: String, required: true },
        paymentStatus: { type: String },
        fulfillmentStatus: { type: String },
        note: { type: String },
        actorId: { type: Schema.Types.ObjectId, ref: 'User' },
        actorRole: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String },
  },
  { timestamps: true }
);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });

export const OrderModel = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);

export interface IPaymentTransaction extends Document {
  orderId: mongoose.Types.ObjectId;
  orderNumber: string;
  userId: mongoose.Types.ObjectId;
  provider: 'cod' | 'sslcommerz';
  transactionRef: string;
  providerValId?: string;
  amount: number;
  currency: 'BDT';
  status: 'initiated' | 'pending' | 'verified' | 'failed' | 'cancelled' | 'refunded';
  channel?: string;
  rawPayloadSummary?: Record<string, unknown>;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['cod', 'sslcommerz'], required: true },
    transactionRef: { type: String, required: true, unique: true, index: true },
    providerValId: { type: String, sparse: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BDT' },
    status: {
      type: String,
      enum: ['initiated', 'pending', 'verified', 'failed', 'cancelled', 'refunded'],
      default: 'initiated',
      index: true,
    },
    channel: { type: String },
    rawPayloadSummary: { type: Schema.Types.Mixed },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

export const PaymentTransactionModel =
  mongoose.models.PaymentTransaction ||
  mongoose.model<IPaymentTransaction>('PaymentTransaction', PaymentTransactionSchema);

export interface IReturnRequest extends Document {
  orderId: mongoose.Types.ObjectId;
  orderNumber: string;
  userId: mongoose.Types.ObjectId;
  reason: string;
  description: string;
  items: Array<{ sku: string; productName: string; quantity: number }>;
  status: 'requested' | 'approved' | 'rejected' | 'received' | 'restocked' | 'refunded';
  inspectionResult?: 'resalable' | 'damaged' | 'pending';
  restocked: boolean;
  adminNote?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReturnRequestSchema = new Schema<IReturnRequest>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 1000 },
    items: [
      {
        sku: { type: String, required: true },
        productName: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'received', 'restocked', 'refunded'],
      default: 'requested',
      index: true,
    },
    inspectionResult: { type: String, enum: ['resalable', 'damaged', 'pending'], default: 'pending' },
    restocked: { type: Boolean, default: false },
    adminNote: { type: String, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const ReturnRequestModel =
  mongoose.models.ReturnRequest || mongoose.model<IReturnRequest>('ReturnRequest', ReturnRequestSchema);

export interface IRefundRecord extends Document {
  orderId: mongoose.Types.ObjectId;
  orderNumber: string;
  returnRequestId?: mongoose.Types.ObjectId;
  transactionId?: mongoose.Types.ObjectId;
  amount: number;
  method: string;
  reference: string;
  status: 'pending' | 'processed' | 'failed';
  reason: string;
  processedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const RefundRecordSchema = new Schema<IRefundRecord>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    returnRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest' },
    transactionId: { type: Schema.Types.ObjectId, ref: 'PaymentTransaction' },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, required: true },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' },
    reason: { type: String, required: true, maxlength: 300 },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const RefundRecordModel =
  mongoose.models.RefundRecord || mongoose.model<IRefundRecord>('RefundRecord', RefundRecordSchema);

export interface IAdminNotification extends Document {
  type: 'new_order' | 'payment_verified' | 'return_requested';
  title: string;
  message: string;
  orderNumber: string;
  orderId: mongoose.Types.ObjectId;
  isRead: boolean;
  readAt?: Date | null;
  readBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const AdminNotificationSchema = new Schema<IAdminNotification>(
  {
    type: {
      type: String,
      enum: ['new_order', 'payment_verified', 'return_requested'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, required: true, maxlength: 300 },
    orderNumber: { type: String, required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    readBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

AdminNotificationSchema.index({ isRead: 1, createdAt: -1 });

export const AdminNotificationModel =
  mongoose.models.AdminNotification ||
  mongoose.model<IAdminNotification>('AdminNotification', AdminNotificationSchema);
