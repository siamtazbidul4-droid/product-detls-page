import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import {
  closeAuthModal,
  fetchCurrentUser,
  openAuthModal,
  setAuthSession,
} from '../../features/auth/authSlice.ts';
import { mergeGuestCartOnLogin } from '../../features/cart/cartSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { mergeGuestWishlistOnLogin } from '../../features/wishlist/wishlistSlice.ts';
import { apiRequest, setAuthToken } from '../../lib/api.ts';
import type { AuthUser } from '../../types/domain.ts';
import { Modal } from '../ui/Modal.tsx';

interface ProviderStatus {
  googleConfigured: boolean;
  facebookConfigured: boolean;
  needsSuperAdminBootstrap: boolean;
}

export function AuthModal() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { modalOpen, modalMode, returnTo } = useAppSelector((s) => s.auth);

  const [mode, setMode] = useState<'login' | 'register' | 'reset' | 'bootstrap'>(modalMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus>({
    googleConfigured: false,
    facebookConfigured: false,
    needsSuperAdminBootstrap: false,
  });

  useEffect(() => {
    setMode(modalMode);
    setError(null);
  }, [modalMode, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    apiRequest<ProviderStatus>('/api/auth/providers')
      .then(setProviders)
      .catch(() => {});
  }, [modalOpen]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'NOVARA_OAUTH_SUCCESS') {
        if (event.data.token) setAuthToken(event.data.token);
        await dispatch(fetchCurrentUser());
        await Promise.all([
          dispatch(mergeGuestCartOnLogin()),
          dispatch(mergeGuestWishlistOnLogin()),
        ]);
        dispatch(closeAuthModal());
        dispatch(pushToast({ variant: 'success', message: 'Signed in successfully.' }));
        if (returnTo) navigate(returnTo);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch, navigate, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'reset') {
        const res = await apiRequest<{ message: string }>('/api/auth/password-reset/request', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        dispatch(pushToast({ variant: 'info', message: res.message }));
        setMode('login');
        return;
      }

      const endpoint =
        mode === 'login'
          ? '/api/auth/login'
          : mode === 'bootstrap'
          ? '/api/auth/bootstrap-admin'
          : '/api/auth/register';

      const body =
        mode === 'login'
          ? { email, password }
          : { name, email, phone: phone || undefined, password };

      const res = await apiRequest<{ token: string; user: AuthUser }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      dispatch(setAuthSession({ user: res.user, token: res.token }));
      await Promise.all([
        dispatch(mergeGuestCartOnLogin()),
        dispatch(mergeGuestWishlistOnLogin()),
      ]);
      dispatch(closeAuthModal());
      dispatch(
        pushToast({
          variant: 'success',
          message:
            mode === 'bootstrap'
              ? 'Super Admin account initialized.'
              : mode === 'register'
              ? 'Welcome to NOVARA COMMERCE!'
              : `Welcome back, ${res.user.name}!`,
        })
      );

      if (returnTo) {
        navigate(returnTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuthPopup = async (provider: 'google' | 'facebook') => {
    setError(null);
    try {
      const res = await apiRequest<{ url: string }>(`/api/auth/oauth/${provider}/url`);
      const popup = window.open(res.url, `novara_${provider}_oauth`, 'width=560,height=680');
      if (!popup) {
        setError('Popup was blocked by your browser. Please allow popups and try again.');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${provider} sign-in is not configured in this environment.`
      );
    }
  };

  const titles = {
    login: 'Sign in to NOVARA COMMERCE',
    register: 'Create Your Customer Account',
    reset: 'Reset Your Password',
    bootstrap: 'Initialize First-Run Super Admin',
  };

  return (
    <Modal
      open={modalOpen}
      onClose={() => dispatch(closeAuthModal())}
      title={titles[mode]}
      description={
        returnTo === '/checkout'
          ? 'Customer account sign-in is required before placing an order.'
          : undefined
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {(mode === 'register' || mode === 'bootstrap') && (
          <div>
            <label htmlFor="auth-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="auth-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tahmid Hasan"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700 mb-1">
            Email Address
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
          />
        </div>

        {(mode === 'register' || mode === 'bootstrap') && (
          <div>
            <label htmlFor="auth-phone" className="block text-xs font-semibold text-slate-700 mb-1">
              Bangladesh Mobile Number (optional)
            </label>
            <input
              id="auth-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+880 17XX-XXXXXX"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
            />
          </div>
        )}

        {mode !== 'reset' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700">
                Password
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => setMode('reset')}
                  className="text-xs text-emerald-700 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id="auth-password"
              type="password"
              required
              minLength={mode === 'login' ? 1 : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'login' ? 'Enter your password' : 'Minimum 8 characters'}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 px-4 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>
            {mode === 'login'
              ? 'Sign In'
              : mode === 'register'
              ? 'Create Account'
              : mode === 'bootstrap'
              ? 'Claim Super Admin Account'
              : 'Send Reset Link'}
          </span>
        </button>
      </form>

      {(mode === 'login' || mode === 'register') && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <div className="flex-1 h-px bg-slate-200" />
            <span>OR CONTINUE WITH</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOAuthPopup('google')}
              className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                providers.googleConfigured
                  ? 'border-slate-200 hover:bg-slate-50 text-slate-800'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              Google {providers.googleConfigured ? '' : '(Setup Required)'}
            </button>
            <button
              type="button"
              onClick={() => handleOAuthPopup('facebook')}
              className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                providers.facebookConfigured
                  ? 'border-slate-200 hover:bg-slate-50 text-slate-800'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              Facebook {providers.facebookConfigured ? '' : '(Setup Required)'}
            </button>
          </div>
        </>
      )}

      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        {mode === 'login' ? (
          <span>
            New to NOVARA?{' '}
            <button
              type="button"
              onClick={() => dispatch(openAuthModal({ mode: 'register', returnTo: returnTo || undefined }))}
              className="text-emerald-700 font-semibold hover:underline"
            >
              Create Account
            </button>
          </span>
        ) : (
          <span>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('login')}
              className="text-emerald-700 font-semibold hover:underline"
            >
              Sign In
            </button>
          </span>
        )}

        {providers.needsSuperAdminBootstrap && mode !== 'bootstrap' && (
          <button
            type="button"
            onClick={() => setMode('bootstrap')}
            className="text-amber-700 font-semibold hover:underline"
          >
            Claim First-Run Super Admin
          </button>
        )}
      </div>
    </Modal>
  );
}
