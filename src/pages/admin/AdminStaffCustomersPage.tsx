import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { hasPermission, STAFF_ROLES, type StaffRole } from '../../../shared/rbac.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { Modal } from '../../components/ui/Modal.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest } from '../../lib/api.ts';

interface UserSummary {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  isActive: boolean;
  createdAt?: string;
}

interface EnquiryItem {
  _id: string;
  ticketNumber: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
}

interface AuditLogEntry {
  _id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  createdAt: string;
}

export function AdminStaffCustomersPage() {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((s) => s.auth.user);

  const canManageStaff = currentUser ? hasPermission(currentUser.role, 'staff:manage') : false;
  const canManageSupport = currentUser ? hasPermission(currentUser.role, 'support:manage') : false;
  const canReadAudit = currentUser ? hasPermission(currentUser.role, 'audit:read') : false;

  const [tab, setTab] = useState<'customers' | 'staff' | 'enquiries' | 'audit'>('customers');
  const [customers, setCustomers] = useState<UserSummary[]>([]);
  const [staff, setStaff] = useState<UserSummary[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Staff modal state
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<UserSummary | null>(null);
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'order_manager' as StaffRole,
    isActive: true,
  });
  const [savingStaff, setSavingStaff] = useState(false);

  // Enquiry modal state
  const [activeEnquiry, setActiveEnquiry] = useState<EnquiryItem | null>(null);
  const [enqStatus, setEnqStatus] = useState<EnquiryItem['status']>('in_progress');
  const [enqNote, setEnqNote] = useState('');
  const [savingEnq, setSavingEnq] = useState(false);

  const loadData = () => {
    apiRequest<{ customers: UserSummary[] }>('/api/users/admin/customers')
      .then((res) => setCustomers(res.customers))
      .catch(() => {});
    if (canManageStaff) {
      apiRequest<{ staff: UserSummary[] }>('/api/users/admin/staff')
        .then((res) => setStaff(res.staff))
        .catch(() => {});
    }
    if (canManageSupport) {
      apiRequest<{ enquiries: EnquiryItem[] }>('/api/support/admin/enquiries')
        .then((res) => setEnquiries(res.enquiries))
        .catch(() => {});
    }
    if (canReadAudit) {
      apiRequest<{ logs: AuditLogEntry[] }>('/api/support/admin/audit-logs')
        .then((res) => setAuditLogs(res.logs))
        .catch(() => {});
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStaff(true);
    try {
      if (editingStaff) {
        await apiRequest(`/api/users/admin/staff/${editingStaff._id || editingStaff.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: staffForm.role, isActive: staffForm.isActive }),
        });
        dispatch(pushToast({ variant: 'success', message: 'Staff role updated.' }));
      } else {
        await apiRequest('/api/users/admin/staff', {
          method: 'POST',
          body: JSON.stringify({
            name: staffForm.name,
            email: staffForm.email,
            password: staffForm.password,
            role: staffForm.role,
          }),
        });
        dispatch(pushToast({ variant: 'success', message: 'Staff member created.' }));
      }
      setStaffModalOpen(false);
      loadData();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to save staff user.',
        })
      );
    } finally {
      setSavingStaff(false);
    }
  };

  const handleUpdateEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEnquiry) return;
    setSavingEnq(true);
    try {
      await apiRequest(`/api/support/admin/enquiries/${activeEnquiry._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: enqStatus,
          internalNote: enqNote.trim() || undefined,
          assignToSelf: true,
        }),
      });
      setActiveEnquiry(null);
      dispatch(pushToast({ variant: 'success', message: 'Support enquiry updated.' }));
      loadData();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to update enquiry.',
        })
      );
    } finally {
      setSavingEnq(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('customers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold ${
              tab === 'customers' ? 'bg-[#16A34A] text-white' : 'bg-white border border-slate-200'
            }`}
          >
            Customers ({customers.length})
          </button>
          {canManageStaff && (
            <button
              type="button"
              onClick={() => setTab('staff')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold ${
                tab === 'staff' ? 'bg-[#16A34A] text-white' : 'bg-white border border-slate-200'
              }`}
            >
              Staff RBAC ({staff.length})
            </button>
          )}
          {canManageSupport && (
            <button
              type="button"
              onClick={() => setTab('enquiries')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold ${
                tab === 'enquiries' ? 'bg-[#16A34A] text-white' : 'bg-white border border-slate-200'
              }`}
            >
              Support Enquiries ({enquiries.length})
            </button>
          )}
          {canReadAudit && (
            <button
              type="button"
              onClick={() => setTab('audit')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold ${
                tab === 'audit' ? 'bg-[#16A34A] text-white' : 'bg-white border border-slate-200'
              }`}
            >
              Audit Logs ({auditLogs.length})
            </button>
          )}
        </div>

        {tab === 'staff' && canManageStaff && (
          <button
            type="button"
            onClick={() => {
              setEditingStaff(null);
              setStaffForm({
                name: '',
                email: '',
                password: '',
                role: 'order_manager',
                isActive: true,
              });
              setStaffModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" /> Add Staff Member
          </button>
        )}
      </div>

      {tab === 'customers' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Customer</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Phone</th>
                <th className="text-right px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c._id || c.email}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'staff' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Staff Name</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Role</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((s) => (
                <tr key={s._id || s.email}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.email}</td>
                  <td className="px-4 py-3 uppercase font-bold text-emerald-700">
                    {s.role.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.isActive ? 'Active' : 'Suspended'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStaff(s);
                        setStaffForm({
                          name: s.name,
                          email: s.email,
                          password: '',
                          role: s.role,
                          isActive: s.isActive,
                        });
                        setStaffModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                      aria-label={`Edit ${s.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'enquiries' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
          {enquiries.map((enq) => (
            <div key={enq._id} className="p-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-slate-900">
                    {enq.ticketNumber}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">
                    {enq.status}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800">{enq.subject}</p>
                <p className="text-xs text-slate-600">{enq.message}</p>
                <p className="text-[11px] text-slate-400">
                  {enq.name} ({enq.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveEnquiry(enq);
                  setEnqStatus(enq.status);
                  setEnqNote('');
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 shrink-0"
              >
                Update
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Action</th>
                <th className="text-left px-4 py-2.5 font-semibold">Resource</th>
                <th className="text-left px-4 py-2.5 font-semibold">Actor</th>
                <th className="text-right px-4 py-2.5 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <tr key={log._id}>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">
                    {log.action}
                  </td>
                  <td className="px-4 py-2.5">{log.resourceType}</td>
                  <td className="px-4 py-2.5">
                    {log.actorEmail} ({log.actorRole})
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Staff Modal */}
      <Modal
        open={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        title={editingStaff ? `Edit Staff Role — ${editingStaff.name}` : 'Create Staff Account'}
      >
        <form onSubmit={handleSaveStaff} className="space-y-4">
          {!editingStaff && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={staffForm.name}
                  onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={staffForm.email}
                  onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Temporary Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={staffForm.password}
                  onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">RBAC Role</label>
            <select
              value={staffForm.role}
              onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
            >
              {STAFF_ROLES.filter((r) => r !== 'customer').map((role) => (
                <option key={role} value={role}>
                  {role.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {editingStaff && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={staffForm.isActive}
                onChange={(e) => setStaffForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span>Account active</span>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStaffModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingStaff}
              className="px-5 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-semibold disabled:opacity-60"
            >
              {savingStaff ? 'Saving...' : 'Save Staff'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Enquiry Update Modal */}
      <Modal
        open={Boolean(activeEnquiry)}
        onClose={() => setActiveEnquiry(null)}
        title={`Ticket ${activeEnquiry?.ticketNumber || ''}`}
      >
        {activeEnquiry && (
          <form onSubmit={handleUpdateEnquiry} className="space-y-4">
            <p className="text-xs text-slate-600">{activeEnquiry.message}</p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={enqStatus}
                onChange={(e) => setEnqStatus(e.target.value as EnquiryItem['status'])}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Internal Staff Note
              </label>
              <textarea
                rows={3}
                value={enqNote}
                onChange={(e) => setEnqNote(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveEnquiry(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEnq}
                className="px-5 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-semibold disabled:opacity-60"
              >
                {savingEnq ? 'Saving...' : 'Update Ticket'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
