import { useEffect, useState } from 'react';
import { Flag, ShieldCheck, Star } from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { Modal } from '../../components/ui/Modal.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest } from '../../lib/api.ts';
import type { ReviewItem } from '../../types/domain.ts';

export function AdminReviewsPage() {
  const dispatch = useAppDispatch();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [moderating, setModerating] = useState<ReviewItem | null>(null);
  const [decision, setDecision] = useState<'approved' | 'pending' | 'rejected'>('approved');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadReviews = () => {
    setLoading(true);
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    apiRequest<{ reviews: ReviewItem[] }>(`/api/reviews/admin/list${query}`)
      .then((res) => setReviews(res.reviews))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReviews();
  }, [statusFilter]);

  const handleQuickModeration = async (
    review: ReviewItem,
    nextStatus: 'approved' | 'pending' | 'rejected'
  ) => {
    try {
      await apiRequest(`/api/reviews/admin/${review._id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      dispatch(pushToast({ variant: 'success', message: `Review marked ${nextStatus}.` }));
      loadReviews();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Moderation failed.',
        })
      );
    }
  };

  const handleModerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moderating) return;
    setSaving(true);
    try {
      await apiRequest(`/api/reviews/admin/${moderating._id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: decision,
          moderationReason: reason || undefined,
        }),
      });
      setModerating(null);
      dispatch(pushToast({ variant: 'success', message: `Review marked ${decision}.` }));
      loadReviews();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Moderation failed.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'pending', label: 'Pending Queue' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
          { id: 'reported', label: 'Reported' },
          { id: '', label: 'All Reviews' },
        ].map((tab) => (
          <button
            key={tab.id || 'all'}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold ${
              statusFilter === tab.id
                ? 'bg-[#16A34A] text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No reviews in this queue.
          </div>
        ) : (
          reviews.map((rev) => {
            const prod = typeof rev.productId === 'object' ? rev.productId : null;
            return (
              <div
                key={rev._id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{rev.userName}</span>
                    <span className="text-xs text-slate-500">
                      on <strong>{prod?.name || 'Product'}</strong>
                    </span>
                    {rev.verifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5" /> Verified Buyer
                      </span>
                    )}
                    {rev.reports && rev.reports.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <Flag className="w-3.5 h-3.5" /> {rev.reports.length} report(s)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${
                          i < rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    ))}
                    <span className="ml-2 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold uppercase text-slate-700">
                      {rev.status}
                    </span>
                  </div>
                  {rev.title && <p className="text-xs font-bold text-slate-800">{rev.title}</p>}
                  <p className="text-xs text-slate-600 max-w-2xl">{rev.comment}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {rev.status !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => void handleQuickModeration(rev, 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold"
                    >
                      Approve
                    </button>
                  )}
                  {rev.status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => void handleQuickModeration(rev, 'pending')}
                      className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold"
                    >
                      Unpublish
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setModerating(rev);
                      setDecision(rev.status || 'approved');
                      setReason(rev.moderationReason || '');
                    }}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    Moderate
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={Boolean(moderating)}
        onClose={() => setModerating(null)}
        title="Moderate Customer Review"
      >
        {moderating && (
          <form onSubmit={handleModerate} className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold text-slate-900">
                {moderating.userName} ({moderating.rating}★)
              </p>
              <p className="text-slate-700">{moderating.comment}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Decision</label>
              <select
                value={decision}
                onChange={(e) =>
                  setDecision(e.target.value as 'approved' | 'pending' | 'rejected')
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="approved">Approve &amp; Publish (Product Page &amp; Homepage)</option>
                <option value="pending">Unpublish to Pending</option>
                <option value="rejected">Reject / Hide Review</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Moderation Note (Optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModerating(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Confirm Decision'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
