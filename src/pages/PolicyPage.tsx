import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SeoHead } from '../components/ui/SeoHead.tsx';
import type { StoreSettings } from '../types/domain.ts';

type PolicyType = 'about' | 'return' | 'shipping' | 'privacy' | 'terms';

const POLICY_META: Record<
  PolicyType,
  { title: string; fallbackBody: string; settingsKey: keyof StoreSettings['policies'] }
> = {
  about: {
    title: 'About NOVARA COMMERCE',
    settingsKey: 'aboutUs',
    fallbackBody:
      'NOVARA COMMERCE is a Bangladesh retail marketplace offering authentic electronics, fashion, books, beauty, and home essentials with verified nationwide courier delivery and 7-day easy returns.',
  },
  return: {
    title: '7-Day Easy Return & Refund Policy',
    settingsKey: 'returnPolicy',
    fallbackBody:
      'Eligible delivered items may be requested for return within 7 days of delivery through your Order Details page. Returned items undergo physical inspection before restocking or refund processing.',
  },
  shipping: {
    title: 'Nationwide Bangladesh Shipping Policy',
    settingsKey: 'shippingPolicy',
    fallbackBody:
      'We deliver across all 8 Divisions and 64 Districts of Bangladesh. Standard and Express shipping rates are calculated transparently at checkout by your selected Division, District, Upazila, and Area zone.',
  },
  privacy: {
    title: 'Privacy Policy',
    settingsKey: 'privacyPolicy',
    fallbackBody:
      'NOVARA COMMERCE respects customer privacy. Account credentials are encrypted, personal delivery details are used strictly for order fulfillment and transactional notifications, and marketing newsletter subscriptions require explicit consent.',
  },
  terms: {
    title: 'Terms & Conditions',
    settingsKey: 'termsAndConditions',
    fallbackBody:
      'All orders placed on NOVARA COMMERCE are subject to inventory verification and Bangladesh consumer protection standards. Prices are listed in Bangladeshi Taka (BDT).',
  },
};

export function PolicyPage({
  type,
  storeSettings,
}: {
  type: PolicyType;
  storeSettings?: StoreSettings | null;
}) {
  const meta = POLICY_META[type];
  const content = storeSettings?.policies?.[meta.settingsKey]?.trim() || meta.fallbackBody;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <SeoHead title={meta.title} description={content.slice(0, 155)} />
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" /> Store Policies & Info
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">{meta.title}</h1>
        <div className="prose prose-slate max-w-none text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {content}
        </div>
        <div className="pt-6 border-t border-slate-100 flex flex-wrap gap-3 text-xs font-semibold">
          <Link to="/contact" className="text-emerald-700 hover:underline">
            Contact Customer Support
          </Link>
          <span className="text-slate-300">|</span>
          <Link to="/shop" className="text-slate-600 hover:text-emerald-700">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
