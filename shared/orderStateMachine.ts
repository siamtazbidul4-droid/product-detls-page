export type OrderLifecycleStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'payment_failed'
  | 'return_requested'
  | 'returned'
  | 'refund_pending'
  | 'refunded';

export const ORDER_LIFECYCLE_STATUSES: OrderLifecycleStatus[] = [
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
];

export type PaymentState = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded';
export type FulfillmentState = 'unfulfilled' | 'processing' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';

const ALLOWED_ORDER_TRANSITIONS: Record<OrderLifecycleStatus, OrderLifecycleStatus[]> = {
  pending: ['confirmed', 'cancelled', 'payment_failed'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['return_requested'],
  return_requested: ['returned', 'delivered'],
  returned: ['refund_pending', 'refunded'],
  refund_pending: ['refunded'],
  refunded: [],
  cancelled: [],
  payment_failed: ['pending', 'cancelled'],
};

export function canTransitionOrderStatus(
  from: OrderLifecycleStatus,
  to: OrderLifecycleStatus
): boolean {
  if (from === to) return false;
  return ALLOWED_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canCustomerCancelOrder(status: OrderLifecycleStatus): boolean {
  return status === 'pending' || status === 'confirmed' || status === 'payment_failed';
}

export function canCustomerRequestReturn(
  status: OrderLifecycleStatus,
  deliveredAt?: Date | string | null,
  now: Date = new Date()
): boolean {
  if (status !== 'delivered') return false;
  if (!deliveredAt) return true;
  const diffDays = (now.getTime() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

export function deriveFulfillmentState(status: OrderLifecycleStatus): FulfillmentState {
  switch (status) {
    case 'processing':
      return 'processing';
    case 'packed':
      return 'packed';
    case 'shipped':
      return 'shipped';
    case 'delivered':
    case 'return_requested':
      return 'delivered';
    case 'returned':
    case 'refund_pending':
    case 'refunded':
      return 'returned';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unfulfilled';
  }
}
