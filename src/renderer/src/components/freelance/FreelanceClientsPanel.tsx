import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceClient } from '../../types';
import { formatINR } from '../../utils/formatters';
import { whatsAppLink } from '../../utils/phone';
import { FreelanceClientForm } from './FreelanceClientForm';
import { Plus, Pencil, Trash2, Building2, MessageCircle, ChevronRight } from 'lucide-react';

/**
 * The studios you do freelance work for, with what each one is actually worth.
 *
 * The department could already total revenue and margin across every job, but not
 * per client — so "what does this studio still owe me" and "which studio is
 * actually worth the work" had no answer without adding it up by hand. Jobs that
 * were never linked to a registered studio are shown as their own row rather than
 * dropped, so the totals here always reconcile with the department's.
 */

interface RollupRow {
  client?: FreelanceClient;
  /** Identifies the row when there is no client behind it. */
  key: string;
  label: string;
  jobs: number;
  activeJobs: number;
  charged: number;
  received: number;
  cost: number;
  paidOut: number;
}

export const FreelanceClientsPanel: React.FC = () => {
  const {
    freelanceClients,
    freelanceJobs,
    deleteFreelanceClient,
    setSelectedFreelanceClientId,
    setActiveView,
    freelanceAccounts,
    freelanceJobEditorCost,
  } = useApp();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<FreelanceClient | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /** Their own page, where the work, the balance and the payments all live. */
  const openStudio = (key: string) => {
    setSelectedFreelanceClientId(key);
    setActiveView('freelanceStudio');
  };

  const rows: RollupRow[] = useMemo(() => {
    const build = (label: string, jobs: typeof freelanceJobs, client?: FreelanceClient): RollupRow => ({
      client,
      key: client?.id || 'unlinked',
      label,
      jobs: jobs.length,
      activeJobs: jobs.filter(j => j.stage !== 'completed').length,
      charged: jobs.reduce((a, j) => a + (Number(j.clientCharge) || 0), 0),
      // From the studio's account, so a payment covering several jobs — or paid ahead
      // of the work — is counted once and in the right place.
      received: client
        ? freelanceAccounts.get(client.id)?.received ?? 0
        : jobs.reduce((a, j) => a + (Number(j.clientPaidAmount) || 0), 0),
      // What the editing actually cost: the share of each editor's payouts split onto
      // these jobs. Nothing paid yet is nothing spent yet.
      cost: jobs.reduce((a, j) => a + freelanceJobEditorCost(j), 0),
      paidOut: jobs.reduce((a, j) => a + freelanceJobEditorCost(j), 0),
    });

    const registered = freelanceClients.map(c =>
      build(c.name, freelanceJobs.filter(j => j.freelanceClientId === c.id), c)
    );

    // Work billed to someone who was never added to the roster still has money in
    // it; hiding it here would make these totals quietly disagree with the
    // department's headline figures.
    const unlinked = freelanceJobs.filter(j => !j.freelanceClientId);
    if (unlinked.length > 0) {
      registered.push(build('One-off / not linked to a studio', unlinked));
    }
    return registered.sort((a, b) => b.charged - a.charged);
  }, [freelanceClients, freelanceJobs, freelanceAccounts, freelanceJobEditorCost]);

  const openAdd = () => {
    setEditingClient(null);
    setIsFormOpen(true);
  };

  const openEdit = (client: FreelanceClient) => {
    setEditingClient(client);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#111417]">Partner Studios</h3>
          <p className="text-[11px] text-[#6b6660]">
            The studios you take freelance work from, and what each is worth. Open one to see
            their jobs, balance and payment history.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7a2e33] text-[#f9f8f6] text-xs font-bold hover:bg-[#5a2226] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Studio
        </button>
      </div>

      {isFormOpen && (
        <FreelanceClientForm
          key={editingClient?.id || 'new'}
          client={editingClient || undefined}
          onClose={() => {
            setIsFormOpen(false);
            setEditingClient(null);
          }}
        />
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-[#d4c1a3] text-center">
          <Building2 className="w-8 h-8 text-[#d4c1a3] mx-auto mb-2" />
          <p className="text-xs font-semibold text-[#111417]">No partner studios yet</p>
          <p className="text-[11px] text-[#6b6660] mt-1">
            Add the studios you take editing work from to track their jobs and balances together.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs overflow-x-auto">
          <table className="w-full text-left min-w-[860px]">
            <thead className="bg-[#f9f8f6] border-b border-[#d4c1a3]">
              <tr className="text-[10px] uppercase tracking-wider text-[#6b6660]">
                <th className="py-2.5 px-4 font-bold">Studio</th>
                <th className="py-2.5 px-4 font-bold">Jobs</th>
                <th className="py-2.5 px-4 font-bold text-right">Charged</th>
                <th className="py-2.5 px-4 font-bold text-right">Received</th>
                <th className="py-2.5 px-4 font-bold text-right">Outstanding</th>
                <th className="py-2.5 px-4 font-bold text-right">Editor Cost</th>
                <th className="py-2.5 px-4 font-bold text-right">Profit</th>
                <th className="py-2.5 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => {
                const outstanding = row.client
                  ? freelanceAccounts.get(row.client.id)?.outstanding ?? 0
                  : Math.max(0, row.charged - row.received);
                const profit = row.charged - row.cost;
                return (
                  <tr
                    key={row.key}
                    onClick={() => openStudio(row.key)}
                    className="text-xs hover:bg-[#f9f8f6]/60 cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#111417] hover:text-[#7a2e33]">{row.label}</div>
                      <div className="text-[10px] text-[#6b6660]">
                        {row.client
                          ? [row.client.contactPerson, row.client.city].filter(Boolean).join(' · ') || '—'
                          : 'Not linked to a registered studio'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-[#111417]">{row.jobs}</span>
                      {row.activeJobs > 0 && (
                        <span className="text-[10px] text-amber-800 font-semibold ml-1">
                          ({row.activeJobs} active)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-[#111417]">{formatINR(row.charged)}</td>
                    <td className="py-3 px-4 text-right text-emerald-700 font-semibold">{formatINR(row.received)}</td>
                    <td className={`py-3 px-4 text-right font-bold ${outstanding > 0 ? 'text-amber-800' : 'text-[#6b6660]'}`}>
                      {formatINR(outstanding)}
                    </td>
                    <td className="py-3 px-4 text-right text-[#6b6660] font-semibold">{formatINR(row.cost)}</td>
                    <td className={`py-3 px-4 text-right font-extrabold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatINR(profit)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {row.client && whatsAppLink(row.client.phone, row.client.dialCode) && (
                          <a
                            href={whatsAppLink(row.client.phone, row.client.dialCode)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700"
                            aria-label={`WhatsApp ${row.client.name}`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {row.client && (
                          <>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                openEdit(row.client!);
                              }}
                              className="p-1.5 rounded-lg hover:bg-[#f9f8f6] text-[#6b6660] cursor-pointer"
                              aria-label={`Edit ${row.client.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setConfirmDeleteId(row.client!.id);
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-700 cursor-pointer"
                              aria-label={`Remove ${row.client.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-[#6b6660]" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl border border-[#d4c1a3] p-5 max-w-sm w-full space-y-3">
            <h4 className="text-sm font-bold text-[#111417]">Remove this studio?</h4>
            <p className="text-xs text-[#6b6660] leading-relaxed">
              Their jobs are kept — the work and the money stay exactly as they are, and simply stop
              being grouped under this studio. Nothing is deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-semibold text-[#111417] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteFreelanceClient(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 cursor-pointer"
              >
                Remove Studio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
