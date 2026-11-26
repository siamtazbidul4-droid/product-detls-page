import mongoose, { Schema, type Document } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  description?: string;
  type: 'fixed' | 'percentage';
  value: number;
  maxDiscountCap?: number | null;
  minOrderAmount: number;
  usageLimit?: number | null;
  usedCount: number;
  perCustomerLimit?: number | null;
  eligibleCategoryIds: mongoose.Types.ObjectId[];
  eligibleProductIds: mongoose.Types.ObjectId[];
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 240 },
    type: { type: String, enum: ['fixed', 'percentage'], required: true },
    value: { type: Number, required: true, min: 1 },
    maxDiscountCap: { type: Number, min: 0, default: null },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, min: 1, default: null },
    usedCount: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, min: 1, default: null },
    eligibleCategoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    eligibleProductIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const CouponModel = mongoose.models.Coupon || mongoose.model<ICoupon>('Coupon', CouponSchema);

export interface ICouponRedemption extends Document {
  couponId: mongoose.Types.ObjectId;
  code: string;
  userId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  discountAmount: number;
  createdAt: Date;
}

const CouponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    code: { type: String, required: true, uppercase: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    discountAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

CouponRedemptionSchema.index({ couponId: 1, userId: 1 });

export const CouponRedemptionModel =
  mongoose.models.CouponRedemption ||
  mongoose.model<ICouponRedemption>('CouponRedemption', CouponRedemptionSchema);

export interface IReview extends Document {
  productId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  rating: number;
  title?: string;
  comment: string;
  images: Array<{ publicId: string; url: string }>;
  verifiedPurchase: boolean;
  orderId?: mongoose.Types.ObjectId | null;
  status: 'pending' | 'approved' | 'rejected';
  moderationReason?: string;
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;
  helpfulVoterIds: mongoose.Types.ObjectId[];
  reports: Array<{
    userId: mongoose.Types.ObjectId;
    reason: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, required: true, trim: true, maxlength: 1500 },
    images: [{ publicId: String, url: String }],
    verifiedPurchase: { type: Boolean, default: false },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    moderationReason: { type: String, maxlength: 300 },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },
    helpfulVoterIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reports: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String, required: true, maxlength: 240 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

export const ReviewModel = mongoose.models.Review || mongoose.model<IReview>('Review', ReviewSchema);
