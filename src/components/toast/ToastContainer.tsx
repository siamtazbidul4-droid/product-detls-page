import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { dismissToast, type ToastItem } from '../../features/toast/toastSlice.ts';

function ToastCard({ toast }: { toast: ToastItem }) {
  const dispatch = useAppDispatch();
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.durationMs);
  const lastTickRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - lastTickRef.current));
      return;
    }

    lastTickRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      dispatch(dismissToast(toast.id));
    }, remainingRef.current);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [dispatch, paused, toast.id]);

  const styles = {
    success: {
      border: 'border-emerald-200',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
      bar: 'bg-emerald-600',
    },
    error: {
      border: 'border-red-200',
      icon: <XCircle className="w-5 h-5 text-red-600 shrink-0" />,
      bar: 'bg-red-600',
    },
    warning: {
      border: 'border-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
      bar: 'bg-amber-500',
    },
    info: {
      border: 'border-sky-200',
      icon: <Info className="w-5 h-5 text-sky-600 shrink-0" />,
      bar: 'bg-sky-600',
    },
  }[toast.variant];

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`relative overflow-hidden bg-white border ${styles.border} rounded-xl shadow-lg px-4 py-3.5 pr-10 min-w-[290px] max-w-sm pointer-events-auto`}
    >
      <div className="flex items-start gap-3">
        {styles.icon}
        <div className="min-w-0 flex-1">
          {toast.title && (
            <p className="text-sm font-semibold text-slate-900 leading-tight mb-0.5">{toast.title}</p>
          )}
          <p className="text-sm text-slate-700 leading-snug">{toast.message}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => dispatch(dismissToast(toast.id))}
        aria-label="Close notification"
        className="absolute top-2.5 right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-100">
        <div
          className={`h-full w-full ${styles.bar} toast-progress-rtl`}
          style={{
            animationDuration: `${toast.durationMs}ms`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAppSelector((state) => state.toast.items);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2.5 pointer-events-none max-w-[calc(100vw-2rem)]"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
