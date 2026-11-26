import { useEffect, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { CloudinaryUploadField } from '../../components/ui/CloudinaryUploadField.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { SafeImage } from '../../components/ui/SafeImage.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest, formatBdt, getAuthToken } from '../../lib/api.ts';
import type { Brand, Category, MediaAsset, Product } from '../../types/domain.ts';

interface ProductFormState {
  name: string;
  nameBn: string;
  slug: string;
  sku: string;
  categoryId: string;
  brandId: string;
  categoryDomain: Product['categoryDomain'];
  shortDescription: string;
  description: string;
  featuresText: string;
  bilingualKeywordsText: string;
  attributesText: string;
  basePrice: number;
  salePrice: string;
  flashSalePrice: string;
  flashSaleStart: string;
  flashSaleEnd: string;
  stockOnHand: number;
  lowStockThreshold: number;
  status: Product['status'];
  isFeatured: boolean;
  codEligible: boolean;
  warrantyInfo: string;
  images: MediaAsset[];
  variants: Array<{
    _id?: string;
    sku: string;
    title: string;
    price: string;
    stockOnHand: number;
    lowStockThreshold: number;
    colorOption: string;
    sizeOption: string;
    isActive: boolean;
  }>;
}

const emptyProductForm = (defaultCategoryId = ''): ProductFormState => ({
  name: '',
  nameBn: '',
  slug: '',
  sku: '',
  categoryId: defaultCategoryId,
  brandId: '',
  categoryDomain: 'general',
  shortDescription: '',
  description: '',
  featuresText: '',
  bilingualKeywordsText: '',
  attributesText: '',
  basePrice: 0,
  salePrice: '',
  flashSalePrice: '',
  flashSaleStart: '',
  flashSaleEnd: '',
  stockOnHand: 10,
  lowStockThreshold: 5,
  status: 'published',
  isFeatured: false,
  codEligible: true,
  warrantyInfo: 'Official 1-Year Warranty',
  images: [],
  variants: [],
});

export function AdminProductsPage() {
  const dispatch = useAppDispatch();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyProductForm());
  const [saving, setSaving] = useState(false);

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState(
    'sku,name,slug,categorySlug,brandSlug,basePrice,salePrice,stockOnHand,status\nNVR-DEMO-01,Sample Product,sample-product,electronics,novara-tech,2500,2199,20,published'
  );
  const [importing, setImporting] = useState(false);

  const loadData = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search.trim()) params.set('q', search.trim());

    Promise.all([
      apiRequest<{ products: Product[]; totalPages: number }>(
        `/api/catalog/admin/products?${params.toString()}`
      ),
      apiRequest<{ categories: Category[] }>('/api/catalog/categories?all=true'),
      apiRequest<{ brands: Brand[] }>('/api/catalog/brands?all=true'),
    ])
      .then(([prodRes, catRes, brandRes]) => {
        setProducts(prodRes.products);
        setTotalPages(Math.max(1, prodRes.totalPages));
        setCategories(catRes.categories);
        setBrands(brandRes.brands);
      })
      .catch((err) => {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to load products.',
          })
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [page]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyProductForm(categories[0]?._id || ''));
    setFormOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingId(p._id);
    const attrLines = Object.entries(p.attributes || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    setForm({
      name: p.name,
      nameBn: p.nameBn || '',
      slug: p.slug,
      sku: p.sku,
      categoryId: typeof p.categoryId === 'object' ? p.categoryId._id : String(p.categoryId),
      brandId: p.brandId && typeof p.brandId === 'object' ? p.brandId._id : '',
      categoryDomain: p.categoryDomain,
      shortDescription: p.shortDescription || '',
      description: p.description,
      featuresText: (p.features || []).join('\n'),
      bilingualKeywordsText: (p.bilingualKeywords || []).join(', '),
      attributesText: attrLines,
      basePrice: p.basePrice,
      salePrice: p.salePrice ? String(p.salePrice) : '',
      flashSalePrice: p.flashSalePrice ? String(p.flashSalePrice) : '',
      flashSaleStart: p.flashSaleStart ? p.flashSaleStart.slice(0, 16) : '',
      flashSaleEnd: p.flashSaleEnd ? p.flashSaleEnd.slice(0, 16) : '',
      stockOnHand: p.stockOnHand,
      lowStockThreshold: p.lowStockThreshold,
      status: p.status,
      isFeatured: p.isFeatured,
      codEligible: p.codEligible,
      warrantyInfo: p.warrantyInfo || '',
      images: p.images || [],
      variants: (p.variants || []).map((v) => ({
        _id: v._id,
        sku: v.sku,
        title: v.title,
        price: v.price !== null && v.price !== undefined ? String(v.price) : '',
        stockOnHand: v.stockOnHand,
        lowStockThreshold: v.lowStockThreshold,
        colorOption: v.options?.Color || '',
        sizeOption: v.options?.Size || '',
        isActive: v.isActive,
      })),
    });
    setFormOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const attributes: Record<string, string> = {};
      for (const line of form.attributesText.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          attributes[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
      }

      const payload = {
        name: form.name.trim(),
        nameBn: form.nameBn.trim() || undefined,
        slug: form.slug.trim().toLowerCase(),
        sku: form.sku.trim().toUpperCase(),
        categoryId: form.categoryId,
        brandId: form.brandId || null,
        categoryDomain: form.categoryDomain,
        shortDescription: form.shortDescription.trim() || undefined,
        description: form.description.trim(),
        features: form.featuresText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        bilingualKeywords: form.bilingualKeywordsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        attributes,
        basePrice: Number(form.basePrice),
        salePrice: form.salePrice ? Number(form.salePrice) : null,
        flashSalePrice: form.flashSalePrice ? Number(form.flashSalePrice) : null,
        flashSaleStart: form.flashSaleStart ? new Date(form.flashSaleStart).toISOString() : null,
        flashSaleEnd: form.flashSaleEnd ? new Date(form.flashSaleEnd).toISOString() : null,
        stockOnHand: Number(form.stockOnHand),
        lowStockThreshold: Number(form.lowStockThreshold),
        status: form.status,
        isFeatured: form.isFeatured,
        codEligible: form.codEligible,
        warrantyInfo: form.warrantyInfo.trim() || undefined,
        images: form.images,
        variants: form.variants.map((v) => ({
          _id: v._id,
          sku: v.sku.trim().toUpperCase(),
          title: v.title.trim(),
          price: v.price ? Number(v.price) : null,
          stockOnHand: Number(v.stockOnHand),
          lowStockThreshold: Number(v.lowStockThreshold),
          options: {
            ...(v.colorOption ? { Color: v.colorOption } : {}),
            ...(v.sizeOption ? { Size: v.sizeOption } : {}),
          },
          isActive: v.isActive,
        })),
      };

      const url = editingId
        ? `/api/catalog/admin/products/${editingId}`
        : '/api/catalog/admin/products';
      const method = editingId ? 'PATCH' : 'POST';

      await apiRequest(url, { method, body: JSON.stringify(payload) });
      setFormOpen(false);
      dispatch(
        pushToast({
          variant: 'success',
          message: editingId ? 'Product updated.' : 'New product created.',
        })
      );
      loadData();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to save product.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/catalog/admin/products/export/csv', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'novara-catalog-export.csv';
      a.click();
      URL.revokeObjectURL(url);
      dispatch(pushToast({ variant: 'success', message: 'Catalog CSV downloaded.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'CSV export failed.',
        })
      );
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    try {
      const res = await apiRequest<{
        importedCount: number;
        errorCount: number;
      }>('/api/catalog/admin/products/import/csv', {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      });
      setCsvOpen(false);
      dispatch(
        pushToast({
          variant: res.errorCount > 0 ? 'warning' : 'success',
          message: `Imported ${res.importedCount} product(s). ${res.errorCount} row error(s).`,
        })
      );
      loadData();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Bulk CSV import failed.',
        })
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            loadData();
          }}
          className="flex items-center gap-2 flex-1 max-w-md"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name or SKU..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm"
            />
          </div>
          <button
            type="submit"
            className="h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setCsvOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4" /> Bulk CSV Import
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Product</th>
                <th className="text-left px-4 py-3 font-semibold">SKU</th>
                <th className="text-left px-4 py-3 font-semibold">Category</th>
                <th className="text-right px-4 py-3 font-semibold">Price</th>
                <th className="text-center px-4 py-3 font-semibold">Stock</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-500">
                    Loading products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-500">
                    No products found. Add a product or seed the Bangladesh catalog from Overview.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <SafeImage
                          src={p.images?.[0]?.url}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate max-w-[240px]">
                            {p.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {p.variants?.length ? `${p.variants.length} variant(s)` : 'Simple SKU'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.sku}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {typeof p.categoryId === 'object' ? p.categoryId?.name : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {formatBdt(p.salePrice || p.basePrice)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {p.variants?.length
                        ? p.variants.reduce((s, v) => s + (v.stockOnHand - v.reservedStock), 0)
                        : p.stockOnHand - p.reservedStock}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                          p.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700'
                            : p.status === 'draft'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-xs text-slate-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Create / Edit Product Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Product' : 'Create New Product'}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product Name (English)
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name: val,
                    slug: editingId
                      ? f.slug
                      : val
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, ''),
                  }));
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bangla Title (Optional)
              </label>
              <input
                type="text"
                value={form.nameBn}
                onChange={(e) => setForm((f) => ({ ...f, nameBn: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">URL Slug</label>
              <input
                type="text"
                required
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Primary SKU</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                required
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Brand</label>
              <select
                value={form.brandId}
                onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="">No Brand</option>
                {brands.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category Domain
              </label>
              <select
                value={form.categoryDomain}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    categoryDomain: e.target.value as Product['categoryDomain'],
                  }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="electronics">Electronics</option>
                <option value="fashion">Fashion</option>
                <option value="books">Books</option>
                <option value="beauty">Beauty</option>
                <option value="home_lifestyle">Home & Living</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Base Price (৳)
              </label>
              <input
                type="number"
                min={0}
                required
                value={form.basePrice}
                onChange={(e) => setForm((f) => ({ ...f, basePrice: Number(e.target.value) }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sale Price (৳)
              </label>
              <input
                type="number"
                min={0}
                value={form.salePrice}
                onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Flash Sale (৳)
              </label>
              <input
                type="number"
                min={0}
                value={form.flashSalePrice}
                onChange={(e) => setForm((f) => ({ ...f, flashSalePrice: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stock</label>
              <input
                type="number"
                min={0}
                value={form.stockOnHand}
                onChange={(e) => setForm((f) => ({ ...f, stockOnHand: Number(e.target.value) }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as Product['status'] }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Flash Sale Start (Optional)
              </label>
              <input
                type="datetime-local"
                value={form.flashSaleStart}
                onChange={(e) => setForm((f) => ({ ...f, flashSaleStart: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Flash Sale End (Optional)
              </label>
              <input
                type="datetime-local"
                value={form.flashSaleEnd}
                onChange={(e) => setForm((f) => ({ ...f, flashSaleEnd: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              required
              minLength={10}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full p-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Specifications (`Key: Value` per line)
              </label>
              <textarea
                rows={3}
                value={form.attributesText}
                onChange={(e) => setForm((f) => ({ ...f, attributesText: e.target.value }))}
                placeholder={'Storage: 256GB\nWarranty: 1 Year'}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bangla/English Search Keywords (comma separated)
              </label>
              <textarea
                rows={3}
                value={form.bilingualKeywordsText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bilingualKeywordsText: e.target.value }))
                }
                placeholder="স্মার্টফোন, ফোন, mobile"
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs"
              />
            </div>
          </div>

          {/* Product Images via Cloudinary */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                Product Images ({form.images.length})
              </span>
              <CloudinaryUploadField
                folder="products"
                onUploaded={(asset) =>
                  setForm((f) => ({ ...f, images: [...f.images, asset] }))
                }
              />
            </div>
            {form.images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.images.map((img, i) => (
                  <div key={img.publicId + i} className="relative group">
                    <SafeImage
                      src={img.url}
                      alt={img.alt || form.name}
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          images: f.images.filter((_, idx) => idx !== i),
                        }))
                      }
                      aria-label="Remove image"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Variants Builder */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                SKU Variants ({form.variants.length})
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    variants: [
                      ...f.variants,
                      {
                        sku: `${f.sku || 'SKU'}-V${f.variants.length + 1}`,
                        title: 'Default Variant',
                        price: '',
                        stockOnHand: 10,
                        lowStockThreshold: 5,
                        colorOption: '',
                        sizeOption: '',
                        isActive: true,
                      },
                    ],
                  }))
                }
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                + Add Variant
              </button>
            </div>

            {form.variants.map((v, idx) => (
              <div
                key={idx}
                className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-slate-50 p-2 rounded-lg items-center"
              >
                <input
                  type="text"
                  required
                  value={v.sku}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.map((item, i) =>
                        i === idx ? { ...item, sku: e.target.value } : item
                      ),
                    }))
                  }
                  placeholder="Variant SKU"
                  className="h-8 px-2 rounded border border-slate-200 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  value={v.title}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.map((item, i) =>
                        i === idx ? { ...item, title: e.target.value } : item
                      ),
                    }))
                  }
                  placeholder="Title (e.g. Black / M)"
                  className="h-8 px-2 rounded border border-slate-200 text-xs"
                />
                <input
                  type="text"
                  value={v.colorOption}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.map((item, i) =>
                        i === idx ? { ...item, colorOption: e.target.value } : item
                      ),
                    }))
                  }
                  placeholder="Color"
                  className="h-8 px-2 rounded border border-slate-200 text-xs"
                />
                <input
                  type="number"
                  value={v.price}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.map((item, i) =>
                        i === idx ? { ...item, price: e.target.value } : item
                      ),
                    }))
                  }
                  placeholder="Price override"
                  className="h-8 px-2 rounded border border-slate-200 text-xs font-mono"
                />
                <input
                  type="number"
                  min={0}
                  value={v.stockOnHand}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.map((item, i) =>
                        i === idx ? { ...item, stockOnHand: Number(e.target.value) } : item
                      ),
                    }))
                  }
                  placeholder="Stock"
                  className="h-8 px-2 rounded border border-slate-200 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.filter((_, i) => i !== idx),
                    }))
                  }
                  className="h-8 px-2 rounded bg-red-50 text-red-600 text-xs font-semibold flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))}
              />
              <span>Featured on Homepage</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.codEligible}
                onChange={(e) => setForm((f) => ({ ...f, codEligible: e.target.checked }))}
              />
              <span>Cash on Delivery Eligible</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk CSV Import Modal */}
      <Modal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        title="Bulk Product CSV Import"
        description="Up to 500 rows per batch. Columns: sku,name,slug,categorySlug,brandSlug,basePrice,salePrice,stockOnHand,status"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleImportCsv} className="space-y-4">
          <textarea
            rows={10}
            required
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCsvOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importing}
              className="px-5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {importing ? 'Importing...' : 'Run CSV Import'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
