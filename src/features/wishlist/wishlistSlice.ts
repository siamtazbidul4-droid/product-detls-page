import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mergeWishlistIds } from '../../../shared/wishlistHelpers.ts';
import { apiRequest } from '../../lib/api.ts';
import { updateUserState } from '../auth/authSlice.ts';
import type { AuthUser, Product } from '../../types/domain.ts';

const GUEST_WISHLIST_KEY = 'novara_guest_wishlist_v1';

function loadGuestWishlist(): string[] {
  try {
    const raw = window.localStorage.getItem(GUEST_WISHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return mergeWishlistIds([], parsed.map((id) => String(id)));
  } catch {
    return [];
  }
}

function saveGuestWishlist(ids: string[]) {
  try {
    window.localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage quota errors
  }
}

interface WishlistState {
  guestIds: string[];
  merging: boolean;
}

const initialState: WishlistState = {
  guestIds: typeof window !== 'undefined' ? loadGuestWishlist() : [],
  merging: false,
};

export const mergeGuestWishlistOnLogin = createAsyncThunk(
  'wishlist/mergeOnLogin',
  async (_, { getState, dispatch }) => {
    const state = getState() as {
      wishlist: WishlistState;
      auth: { user: AuthUser | null };
    };
    const guestIds = state.wishlist.guestIds;
    if (guestIds.length === 0) return { merged: false, wishlist: state.auth.user?.wishlist || [] };

    const res = await apiRequest<{ wishlist: string[]; items: Product[] }>(
      '/api/users/wishlist/merge',
      {
        method: 'POST',
        body: JSON.stringify({ productIds: guestIds }),
      }
    );

    if (state.auth.user) {
      dispatch(updateUserState({ ...state.auth.user, wishlist: res.wishlist }));
    }
    saveGuestWishlist([]);
    return { merged: true, wishlist: res.wishlist };
  }
);

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState,
  reducers: {
    toggleGuestWishlistItem(state, action: PayloadAction<string>) {
      const id = action.payload;
      const idx = state.guestIds.indexOf(id);
      if (idx >= 0) {
        state.guestIds.splice(idx, 1);
      } else {
        state.guestIds = mergeWishlistIds(state.guestIds, [id]);
      }
      saveGuestWishlist(state.guestIds);
    },
    removeGuestWishlistItem(state, action: PayloadAction<string>) {
      state.guestIds = state.guestIds.filter((id) => id !== action.payload);
      saveGuestWishlist(state.guestIds);
    },
    clearGuestWishlist(state) {
      state.guestIds = [];
      saveGuestWishlist([]);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(mergeGuestWishlistOnLogin.pending, (state) => {
        state.merging = true;
      })
      .addCase(mergeGuestWishlistOnLogin.fulfilled, (state, action) => {
        state.merging = false;
        if (action.payload.merged) {
          state.guestIds = [];
        }
      })
      .addCase(mergeGuestWishlistOnLogin.rejected, (state) => {
        state.merging = false;
      });
  },
});

export const {
  toggleGuestWishlistItem,
  removeGuestWishlistItem,
  clearGuestWishlist,
} = wishlistSlice.actions;

export default wishlistSlice.reducer;
