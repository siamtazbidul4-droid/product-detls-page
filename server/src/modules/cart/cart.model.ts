import mongoose, { Schema, type Document } from 'mongoose';

export interface ICartItem {
  productId: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId | null;
  quantity: number;
}

export interface ICart extends Document {
  userId: mongoose.Types.ObjectId;
  items: ICartItem[];
  appliedCouponCode?: string | null;
  updatedAt: Date;
}

const CartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: { type: Schema.Types.ObjectId, default: null },
        quantity: { type: Number, required: true, min: 1, max: 50 },
      },
    ],
    appliedCouponCode: { type: String, uppercase: true, trim: true, default: null },
  },
  { timestamps: true }
);

export const CartModel = mongoose.models.Cart || mongoose.model<ICart>('Cart', CartSchema);
