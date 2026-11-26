import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiRequest } from '../../lib/api.ts';
import type { CartItem } from '../../types/domain.ts';

const GUEST_CART_STORAGE_KEY = 'novara_guest_cart_v1';

function loadGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestCart(items: CartItem[]): void {
  try {
    localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota issues
  }
}

interface CartState {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  appliedCouponCode: string | null;
  couponMessage?: string;
  loading: boolean;
  drawerOpen: boolean;
  error: string | null;
}

const initialGuestItems = loadGuestCart();

const initialState: CartState = {
  items: initialGuestItems,
  subtotal: initialGuestItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  discountAmount: 0,
  appliedCouponCode: null,
  loading: false,
  drawerOpen: false,
  error: null,
};

interface ServerCartPayload {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  appliedCouponCode: string | null;
  couponMessage?: string;
}

export const syncServerCart = createAsyncThunk('cart/sync', async () => {
  return apiRequest<ServerCartPayload>('/api/cart');
});

export const mergeGuestCartOnLogin = createAsyncThunk('cart/merge', async () => {
  const guestItems = loadGuestCart();
  if (guestItems.length === 0) {
    return apiRequest<ServerCartPayload>('/api/cart');
  }
  const merged = await apiRequest<ServerCartPayload>('/api/cart/merge', {
    method: 'POST',
    body: JSON.stringify({
      items: guestItems.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
      })),
    }),
  });
  localStorage.removeItem(GUEST_CART_STORAGE_KEY);
  return merged;
});

export const addToServerCart = createAsyncThunk(
  'cart/addServerItem',
  async (payload: { productId: string; variantId?: string | null; quantity: number }) => {
    return apiRequest<ServerCartPayload>('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
);

export const updateServerCartQty = createAsyncThunk(
  'cart/updateServerQty',
  async (payload: { productId: string; variantId?: string | null; quantity: number }) => {
    return apiRequest<ServerCartPayload>('/api/cart/items', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }
);

export const applyServerCoupon = createAsyncThunk('cart/applyCoupon', async (code: string) => {
  return apiRequest<ServerCartPayload>('/api/cart/coupon', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
});

export const removeServerCoupon = createAsyncThunk('cart/removeCoupon', async () => {
  return apiRequest<ServerCartPayload>('/api/cart/coupon', {
    method: 'DELETE',
  });
});

function applyServerPayload(state: CartState, payload: ServerCartPayload) {
  state.items = payload.items;
  state.subtotal = payload.subtotal;
  state.discountAmount = payload.discountAmount;
  state.appliedCouponCode = payload.appliedCouponCode;
  state.couponMessage = payload.couponMessage;
  state.loading = false;
  state.error = null;
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    setCartDrawerOpen(state, action: PayloadAction<boolean>) {
      state.drawerOpen = action.payload;
    },
    addGuestCartItem(state, action: PayloadAction<CartItem>) {
      const incoming = action.payload;
      const existing = state.items.find(
        (i) => i.productId === incoming.productId && (i.variantId || null) === (incoming.variantId || null)
      );
      if (existing) {
        existing.quantity = Math.min(incoming.availableStock || 50, existing.quantity + incoming.quantity);
      } else {
        state.items.push(incoming);
      }
      state.subtotal = state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      saveGuestCart(state.items);
    },
    updateGuestCartQty(
      state,
      action: PayloadAction<{ productId: string; variantId?: string | null; quantity: number }>
    ) {
      const { productId, variantId, quantity } = action.payload;
      if (quantity <= 0) {
        state.items = state.items.filter(
          (i) => !(i.productId === productId && (i.variantId || null) === (variantId || null))
        );
      } else {
        const target = state.items.find(
          (i) => i.productId === productId && (i.variantId || null) === (variantId || null)
        );
        if (target) {
          target.quantity = Math.min(target.availableStock || 50, quantity);
        }
      }
      state.subtotal = state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      saveGuestCart(state.items);
    },
    clearCartAfterOrder(state) {
      state.items = [];
      state.subtotal = 0;
      state.discountAmount = 0;
      state.appliedCouponCode = null;
      localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    },
    restoreGuestCartOnLogout(state) {
      const guest = loadGuestCart();
      state.items = guest;
      state.subtotal = guest.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      state.discountAmount = 0;
      state.appliedCouponCode = null;
    },
  },
  extraReducers: (builder) => {
    const thunks = [
      syncServerCart,
      mergeGuestCartOnLogin,
      addToServerCart,
      updateServerCartQty,
      applyServerCoupon,
      removeServerCoupon,
    ];
    for (const thunk of thunks) {
      builder
        .addCase(thunk.pending, (state) => {
          state.loading = true;
          state.error = null;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          applyServerPayload(state, action.payload);
        })
        .addCase(thunk.rejected, (state, action) => {
          state.loading = false;
          state.error = action.error.message || 'Cart operation failed';
        });
    }
  },
});

export const {
  setCartDrawerOpen,
  addGuestCartItem,
  updateGuestCartQty,
  clearCartAfterOrder,
  restoreGuestCartOnLogout,
} = cartSlice.actions;

export default cartSlice.reducer;
