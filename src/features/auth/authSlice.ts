import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { apiRequest, setAuthToken } from '../../lib/api.ts';
import type { AuthUser } from '../../types/domain.ts';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  modalOpen: boolean;
  modalMode: 'login' | 'register' | 'reset' | 'bootstrap';
  returnTo: string | null;
}

const initialState: AuthState = {
  user: null,
  loading: false,
  initialized: false,
  modalOpen: false,
  modalMode: 'login',
  returnTo: null,
};

export const fetchCurrentUser = createAsyncThunk('auth/me', async () => {
  const res = await apiRequest<{ user: AuthUser }>('/api/auth/me');
  return res.user;
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // Clear client session even if network request fails
  } finally {
    setAuthToken(null);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthSession(state, action: PayloadAction<{ user: AuthUser; token?: string }>) {
      state.user = action.payload.user;
      state.initialized = true;
      if (action.payload.token) {
        setAuthToken(action.payload.token);
      }
    },
    updateUserState(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
    },
    openAuthModal(
      state,
      action: PayloadAction<{ mode?: 'login' | 'register' | 'reset' | 'bootstrap'; returnTo?: string } | undefined>
    ) {
      state.modalOpen = true;
      state.modalMode = action.payload?.mode || 'login';
      state.returnTo = action.payload?.returnTo ?? null;
    },
    closeAuthModal(state) {
      state.modalOpen = false;
      state.returnTo = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
        state.initialized = true;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.loading = false;
        state.initialized = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
      })
      .addCase(logoutUser.rejected, (state) => {
        state.user = null;
      });
  },
});

export const { setAuthSession, updateUserState, openAuthModal, closeAuthModal } = authSlice.actions;
export default authSlice.reducer;
