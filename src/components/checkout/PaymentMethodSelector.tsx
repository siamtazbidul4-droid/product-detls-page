import { AlertCircle, Check } from 'lucide-react';

export type PaymentChannelChoice = 'card' | 'bkash' | 'nagad' | 'cod';

interface PaymentMethodSelectorProps {
  value: PaymentChannelChoice;
  onChange: (channel: PaymentChannelChoice) => void;
  gatewayConfigured: boolean;
  codEligible: boolean;
}

const PAYMENT_OPTIONS: Array<{
  id: PaymentChannelChoice;
  label: string;
  isOnline: boolean;
}> = [
  { id: 'card', label: 'Credit / Debit Card', isOnline: true },
  { id: 'bkash', label: 'bKash', isOnline: true },
  { id: 'nagad', label: 'Nagad', isOnline: true },
  { id: 'cod', label: 'Cash on Delivery', isOnline: false },
];

function ChannelLogo({ id }: { id: PaymentChannelChoice }) {
  if (id === 'card') {
    return (
      <svg viewBox="0 0 48 34" className="w-11 h-8" aria-hidden="true">
        <rect x="2" y="3" width="44" height="28" rx="5" fill="#16A34A" />
        <rect x="2" y="9" width="44" height="5" fill="#14532D" opacity="0.45" />
        <rect x="7" y="18" width="11" height="7" rx="1.5" fill="#ECFDF5" />
        <circle cx="34" cy="22" r="3" fill="#DCFCE7" opacity="0.9" />
        <circle cx="39" cy="22" r="3" fill="#86EFAC" opacity="0.9" />
      </svg>
    );
  }
  if (id === 'bkash') {
    return (
      <svg viewBox="0 0 48 36" className="w-11 h-8" aria-hidden="true">
        <path d="M13 6L26 17L19 26L13 6Z" fill="#E2136E" />
        <path d="M26 17L39 14L27 29L19 26L26 17Z" fill="#B90F5A" />
        <path d="M9 12L17 14L19 26L9 12Z" fill="#F43F8E" />
      </svg>
    );
  }
  if (id === 'nagad') {
    return (
      <svg viewBox="0 0 48 36" className="w-11 h-8" aria-hidden="true">
        <circle cx="24" cy="18" r="13" fill="#F97316" />
        <circle cx="24" cy="18" r="8" fill="#DC2626" />
        <circle cx="24" cy="18" r="4.5" fill="#FEF3C7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 36" className="w-11 h-8" aria-hidden="true">
      <rect x="4" y="10" width="34" height="20" rx="3" fill="#15803D" />
      <rect x="10" y="6" width="34" height="20" rx="3" fill="#16A34A" stroke="#DCFCE7" strokeWidth="1.5" />
      <circle cx="27" cy="16" r="5" fill="#DCFCE7" />
      <text x="27" y="19" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#15803D">
        ৳
      </text>
    </svg>
  );
}

export function PaymentMethodSelector({
  value,
  onChange,
  gatewayConfigured,
  codEligible,
}: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Payment method"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {PAYMENT_OPTIONS.map((option) => {
          const isSelected = value === option.id;
          const isDisabled =
            (option.isOnline && !gatewayConfigured) ||
            (option.id === 'cod' && !codEligible);

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isDisabled}
              onClick={() => !isDisabled && onChange(option.id)}
              className={`relative rounded-xl border p-4 flex flex-col items-center justify-center gap-2.5 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] ${
                isDisabled
                  ? 'border-slate-200 bg-slate-50/80 text-slate-400 cursor-not-allowed opacity-70'
                  : isSelected
                  ? 'border-2 border-[#16A34A] bg-emerald-50/40 shadow-xs text-slate-900'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
              }`}
            >
              {isSelected && !isDisabled && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-xs">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              )}

              <ChannelLogo id={option.id} />

              <span className="text-xs font-bold leading-snug">{option.label}</span>

              {option.isOnline && !gatewayConfigured && (
                <span className="text-[10px] text-amber-700 font-medium leading-tight">
                  Gateway setup required
                </span>
              )}
              {option.id === 'cod' && !codEligible && (
                <span className="text-[10px] text-red-600 font-medium leading-tight">
                  Not COD eligible
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!gatewayConfigured && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/80 px-3.5 py-2.5 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Online card &amp; MFS payments (Credit/Debit Card, bKash, Nagad via SSLCommerz) are disabled until gateway credentials are configured on the server. Cash on Delivery is active and ready.
          </p>
        </div>
      )}
    </div>
  );
}
