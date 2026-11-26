import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, MapPin, MessageSquare, Phone, Send } from 'lucide-react';
import { sanitizeHref } from '../../shared/security.ts';
import { useAppDispatch, useAppSelector } from '../app/hooks.ts';
import { SeoHead } from '../components/ui/SeoHead.tsx';
import { pushToast } from '../features/toast/toastSlice.ts';
import { apiRequest } from '../lib/api.ts';
import type { StoreSettings } from '../types/domain.ts';

export function ContactPage({ storeSettings }: { storeSettings?: StoreSettings | null }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [orderNumber, setOrderNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName((prev) => prev || user.name || '');
    setEmail((prev) => prev || user.email || '');
    setPhone((prev) => prev || user.phone || '');
  }, [user]);

  const safeWhatsappUrl = sanitizeHref(storeSettings?.socialLinks?.whatsapp);
  const safeMessengerUrl = sanitizeHref(storeSettings?.socialLinks?.messenger);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest<{ ticketNumber: string; message: string }>(
        '/api/support/enquiries',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            phone,
            orderNumber,
            subject,
            message,
            website,
          }),
        }
      );
      setTicketNumber(res.ticketNumber);
      setSubject('');
      setMessage('');
      setOrderNumber('');
      dispatch(pushToast({ variant: 'success', message: res.message }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to send support enquiry.',
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <SeoHead
        title="Contact & Customer Support"
        description="Reach NOVARA COMMERCE customer support in Bangladesh for orders, returns, and product enquiries."
      />

      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="inline-block px-3 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
          Customer Support
        </span>
        <h1 className="text-3xl font-extrabold text-slate-900">How Can We Help You?</h1>
        <p className="text-sm text-slate-600">
          Have questions about delivery across Bangladesh, product warranty, or returns? Submit a ticket below.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-bold text-slate-900">Store Contact Details</h2>
          <div className="space-y-4 text-sm text-slate-600">
            {storeSettings?.supportPhone && (
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">Support Phone</p>
                  <p>{storeSettings.supportPhone}</p>
                </div>
              </div>
            )}
            {storeSettings?.supportEmail && (
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">Support Email</p>
                  <p>{storeSettings.supportEmail}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Bangladesh Office</p>
                <p>{storeSettings?.businessAddress || 'Dhaka, Bangladesh'}</p>
              </div>
            </div>
            {(safeWhatsappUrl || safeMessengerUrl) && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                {safeWhatsappUrl && (
                  <a
                    href={safeWhatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Support
                  </a>
                )}
                {safeMessengerUrl && (
                  <a
                    href={safeMessengerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold"
                  >
                    Messenger
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {ticketNumber ? (
            <div className="py-10 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h2 className="text-xl font-extrabold text-slate-900">
                Support Ticket {ticketNumber} Received
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Our support specialists have logged your enquiry and will respond via email shortly.
              </p>
              <button
                type="button"
                onClick={() => setTicketNumber(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
              >
                Submit Another Enquiry
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Send a Support Message</h2>

              {/* Honeypot anti-spam field */}
              <div className="sr-only" aria-hidden="true">
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+880 1XXXXXXXXX"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Order Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="NVR-2611-XXXXXX"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Delivery schedule, warranty claim, or product question"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Message</label>
                <textarea
                  required
                  minLength={10}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share details so we can resolve your request quickly..."
                  className="w-full p-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Enquiry'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
