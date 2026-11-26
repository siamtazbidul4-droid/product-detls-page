import { useEffect, useState } from 'react';
import { useAppDispatch } from '../../app/hooks.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest } from '../../lib/api.ts';
import type { StoreSettings } from '../../types/domain.ts';

export function AdminSettingsPage() {
  const dispatch = useAppDispatch();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ settings: StoreSettings }>('/api/cms/admin/settings')
      .then((res) => setSettings(res.settings))
      .catch((err) => {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to load store settings.',
          })
        );
      });
  }, [dispatch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ settings: StoreSettings }>('/api/cms/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      dispatch(pushToast({ variant: 'success', message: 'Store settings updated.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to save settings.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-slate-900">Store Profile & Contact Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Store Name</label>
            <input
              type="text"
              value={settings.storeName}
              onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
            <input
              type="text"
              value={settings.tagline}
              onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Support Email</label>
            <input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Support Phone</label>
            <input
              type="text"
              value={settings.supportPhone}
              onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Business Address
          </label>
          <input
            type="text"
            value={settings.businessAddress}
            onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-slate-900">
          Bangladesh Shipping Zone Charges (৳)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Dhaka Metro</label>
            <input
              type="number"
              min={0}
              value={settings.shipping.dhakaMetroCharge}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  shipping: { ...settings.shipping, dhakaMetroCharge: Number(e.target.value) },
                })
              }
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Dhaka Suburb</label>
            <input
              type="number"
              min={0}
              value={settings.shipping.dhakaSuburbCharge}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  shipping: { ...settings.shipping, dhakaSuburbCharge: Number(e.target.value) },
                })
              }
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Outside Dhaka
            </label>
            <input
              type="number"
              min={0}
              value={settings.shipping.outsideDhakaCharge}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  shipping: { ...settings.shipping, outsideDhakaCharge: Number(e.target.value) },
                })
              }
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Free Over (৳)
            </label>
            <input
              type="number"
              min={0}
              value={settings.shipping.freeShippingThreshold}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  shipping: {
                    ...settings.shipping,
                    freeShippingThreshold: Number(e.target.value),
                  },
                })
              }
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Express Surcharge
            </label>
            <input
              type="number"
              min={0}
              value={settings.shipping.expressSurcharge}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  shipping: { ...settings.shipping, expressSurcharge: Number(e.target.value) },
                })
              }
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 max-w-xs">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Checkout Tax / VAT Rate (%)
          </label>
          <input
            type="number"
            min={0}
            max={30}
            step="0.5"
            value={settings.taxRate ?? 0}
            onChange={(e) =>
              setSettings({
                ...settings,
                taxRate: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
              })
            }
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Applied server-side on discounted order subtotal (0–30%). Set 0 for tax-exempt items.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-slate-900">Storefront Policies & AdSense</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Return Policy</label>
            <textarea
              rows={3}
              value={settings.policies.returnPolicy}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  policies: { ...settings.policies, returnPolicy: e.target.value },
                })
              }
              className="w-full p-2.5 rounded-lg border border-slate-200 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Shipping Policy
            </label>
            <textarea
              rows={3}
              value={settings.policies.shippingPolicy}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  policies: { ...settings.policies, shippingPolicy: e.target.value },
                })
              }
              className="w-full p-2.5 rounded-lg border border-slate-200 text-xs"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={settings.adsense.enabled}
            onChange={(e) =>
              setSettings({
                ...settings,
                adsense: { ...settings.adsense, enabled: e.target.checked },
              })
            }
          />
          <span>Enable Google AdSense Slot (requires valid Publisher ID & Ad Slot ID)</span>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
        >
          {saving ? 'Saving Settings...' : 'Save Store Settings'}
        </button>
      </div>
    </form>
  );
}
