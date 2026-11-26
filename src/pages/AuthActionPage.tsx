import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, MailCheck, ShieldAlert } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch } from '../app/hooks.ts';
import { SeoHead } from '../components/ui/SeoHead.tsx';
import { fetchCurrentUser, openAuthModal } from '../features/auth/authSlice.ts';
import { pushToast } from '../features/toast/toastSlice.ts';
import { apiRequest } from '../lib/api.ts';

export function AuthActionPage({ mode }: { mode: 'verify-email' | 'reset-password' }) {
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const token = searchParams.get('token')?.trim() || '';

  const [verifying, setVerifying] = useState(mode === 'verify-email');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== 'verify-email') return;
    if (!token) {
      setVerifying(false);
      setStatus('error');
      setMessage('Verification token is missing or invalid.');
      return;
    }

    setVerifying(true);
    apiRequest<{ ok: boolean; message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        setStatus('success');
        setMessage(res.message || 'Your email address has been verified.');
        void dispatch(fetchCurrentUser());
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Unable to verify email address.');
      })
      .finally(() => setVerifying(false));
  }, [mode, token, dispatch]);

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setStatus('error');
      setMessage('Password reset token is missing.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setStatus('idle');
    setMessage('');
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setStatus('success');
      setMessage(res.message || 'Your password has been updated.');
      dispatch(pushToast({ variant: 'success', message: 'Password updated. You can now sign in.' }));
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'verify-email') {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <SeoHead title="Verify Email – NOVARA COMMERCE" />
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          {verifying ? (
            <>
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
              <h1 className="text-xl font-extrabold text-slate-900">Verifying Your Email...</h1>
              <p className="text-sm text-slate-500">Please wait while we confirm your account.</p>
            </>
          ) : status === 'success' ? (
            <>
              <MailCheck className="w-12 h-12 text-emerald-600 mx-auto" />
              <h1 className="text-xl font-extrabold text-slate-900">Email Verified</h1>
              <p className="text-sm text-slate-600">{message}</p>
              <div className="pt-2 flex justify-center gap-3">
                <Link
                  to="/account"
                  className="px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold"
                >
                  Go to Account
                </Link>
                <Link
                  to="/shop"
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold"
                >
                  Browse Shop
                </Link>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
              <h1 className="text-xl font-extrabold text-slate-900">Verification Failed</h1>
              <p className="text-sm text-slate-600">{message}</p>
              <Link
                to="/"
                className="inline-block px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
              >
                Back to Storefront
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <SeoHead title="Reset Password – NOVARA COMMERCE" />
      <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-5 shadow-sm">
        {status === 'success' ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h1 className="text-xl font-extrabold text-slate-900">Password Updated</h1>
            <p className="text-sm text-slate-600">{message}</p>
            <button
              type="button"
              onClick={() => dispatch(openAuthModal({ mode: 'login', returnTo: '/account' }))}
              className="px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Sign In Now
            </button>
          </div>
        ) : !token ? (
          <div className="text-center space-y-4">
            <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
            <h1 className="text-xl font-extrabold text-slate-900">Invalid Reset Link</h1>
            <p className="text-sm text-slate-600">
              This password reset link is incomplete or expired. Please request a new reset email.
            </p>
            <button
              type="button"
              onClick={() => dispatch(openAuthModal({ mode: 'reset' }))}
              className="px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Request New Reset Link
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900">Choose a New Password</h1>
                <p className="text-xs text-slate-500">Minimum 8 characters required.</p>
              </div>
            </div>

            {status === 'error' && message && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {message}
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  id="reset-new-password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label htmlFor="reset-confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Update Password</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
