import mongoose, { Schema, type Document } from 'mongoose';

export interface IInventoryMovement extends Document {
  productId: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId | null;
  sku: string;
  type:
    | 'initial'
    | 'restock'
    | 'adjustment'
    | 'reserve'
    | 'release'
    | 'fulfill'
    | 'return_restock';
  quantityDelta: number;
  reservedDelta: number;
  reason: string;
  orderId?: mongoose.Types.ObjectId | null;
  actorId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const InventoryMovementSchema = new Schema<IInventoryMovement>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    sku: { type: String, required: true, uppercase: true, index: true },
    type: {
      type: String,
      enum: ['initial', 'restock', 'adjustment', 'reserve', 'release', 'fulfill', 'return_restock'],
      required: true,
    },
    quantityDelta: { type: Number, required: true },
    reservedDelta: { type: Number, default: 0 },
    reason: { type: String, required: true, maxlength: 240 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const InventoryMovementModel =
  mongoose.models.InventoryMovement ||
  mongoose.model<IInventoryMovement>('InventoryMovement', InventoryMovementSchema);
