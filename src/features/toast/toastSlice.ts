import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  durationMs: number;
  createdAt: number;
}

interface ToastState {
  items: ToastItem[];
}

const initialState: ToastState = {
  items: [],
};

const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    pushToast: {
      reducer(state, action: PayloadAction<ToastItem>) {
        // Prevent duplicate concurrent toast messages
        const duplicateIndex = state.items.findIndex(
          (t) => t.message === action.payload.message && t.variant === action.payload.variant
        );
        if (duplicateIndex >= 0) {
          state.items[duplicateIndex] = action.payload;
        } else {
          state.items.push(action.payload);
          if (state.items.length > 4) {
            state.items.shift();
          }
        }
      },
      prepare(payload: {
        variant: ToastVariant;
        message: string;
        title?: string;
        durationMs?: number;
      }) {
        return {
          payload: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            variant: payload.variant,
            title: payload.title,
            message: payload.message,
            durationMs: payload.durationMs ?? 4000,
            createdAt: Date.now(),
          },
        };
      },
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.items = state.items.filter((t) => t.id !== action.payload);
    },
  },
});

export const { pushToast, dismissToast } = toastSlice.actions;
export default toastSlice.reducer;
