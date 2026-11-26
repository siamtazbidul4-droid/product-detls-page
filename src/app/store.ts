import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice.ts';
import cartReducer from '../features/cart/cartSlice.ts';
import toastReducer from '../features/toast/toastSlice.ts';
import wishlistReducer from '../features/wishlist/wishlistSlice.ts';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    toast: toastReducer,
    wishlist: wishlistReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
