import { ArrowRight, Headphones } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CheckoutSupportSection() {
  return (
    <section
      aria-label="Customer support and accepted payments"
      className="bg-white border border-slate-200 rounded-2xl px-5 py-5 sm:px-8 sm:py-6 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-5"
    >
      <div className="flex items-center gap-4 text-center sm:text-left">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-[#16A34A] flex items-center justify-center shrink-0">
          <Headphones className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Need Help?</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Our support team is here to help you 24/7 with delivery or payment questions.
          </p>
        </div>
      </div>

      <Link
        to="/contact"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-bold transition-colors shrink-0 shadow-xs"
      >
        <span>Contact Support</span>
        <ArrowRight className="w-4 h-4" />
      </Link>

      <div className="flex items-center gap-2 flex-wrap justify-center lg:border-l lg:border-slate-200 lg:pl-6">
        <span className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-blue-800 font-extrabold text-xs">
          VISA
        </span>
        <span className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-orange-600 font-extrabold text-xs">
          Mastercard
        </span>
        <span className="px-2.5 py-1 rounded-md bg-pink-600 text-white font-bold text-xs">
          bKash
        </span>
        <span className="px-2.5 py-1 rounded-md bg-orange-600 text-white font-bold text-xs">
          Nagad
        </span>
        <span className="px-2.5 py-1 rounded-md bg-emerald-700 text-white font-bold text-xs">
          COD
        </span>
      </div>
    </section>
  );
}
