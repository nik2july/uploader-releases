import React from 'react';
import { useApp } from '../../context/AppContext';
import { formatDate } from '../../utils/formatters';
import { DEFAULT_DAILY_CAPACITY_HOURS, dailyCapacityOf } from '../../utils/scheduling';
import { useStudioSchedules } from '../../hooks/useStudioSchedules';
import { CalendarClock, AlertTriangle, Briefcase, Film, CheckCircle2 } from 'lucide-react';

/**
 * When each editor will actually finish what they are holding.
 *
 * The studio's two streams of post-production work run on different clocks — wedding
 * deliverables are known months ahead but cannot start until the shoot has happened,
 * freelance jobs arrive unannounced and are only real once the raw data lands. Quoting
 * a date by eye means holding both queues in your head at once. This lays them on the
 * calendar instead, so a promised date is one the studio can actually keep.
 */
export const EditorSchedulePanel: React.FC = () => {
  const { team } = useApp();
  const schedules = useStudioSchedules();

  const totalUnestimated = schedules.reduce((n, s) => n + s.unestimatedCount, 0);

  if (schedules.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 border border-[#d4c1a3] text-center">
        <CalendarClock className="w-8 h-8 text-[#d4c1a3] mx-auto mb-2" />
        <p className="text-xs font-semibold text-[#111417]">No work assigned to any editor yet</p>
        <p className="text-[11px] text-[#6b6660] mt-1">
          Assign a deliverable or a freelance job to someone and their delivery forecast appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[#111417]">Editor Schedule</h3>
        <p className="text-[11px] text-[#6b6660]">
          When each editor finishes what they are holding, studio work first and freelance filling
          the gaps. Leave is skipped, so these are dates you can promise.
        </p>
      </div>

      {totalUnestimated > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-900 leading-snug">
            <strong>{totalUnestimated}</strong> {totalUnestimated === 1 ? 'item has' : 'items have'} no
            effort estimate, so {totalUnestimated === 1 ? 'it is' : 'they are'} left out of the dates
            below. Every date shown is therefore optimistic until {totalUnestimated === 1 ? 'it is' : 'they are'} filled in.
          </p>
        </div>
      )}

      {schedules.map(s => {
        const member = team.find(m => m.id === s.memberId);
        const capacity = member ? dailyCapacityOf(member) : DEFAULT_DAILY_CAPACITY_HOURS;
        return (
          <div key={s.memberId} className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#f9f8f6] border-b border-[#d4c1a3]">
              <div>
                <div className="text-sm font-bold text-[#111417]">{s.memberName}</div>
                <div className="text-[10px] text-[#6b6660]">
                  {s.backlogHours}h queued · {capacity}h/day
                  {(member?.unavailablePeriods?.length ?? 0) > 0 && ' · has leave booked'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#6b6660]">Free From</div>
                <div className="text-sm font-bold text-emerald-700">
                  {s.freeFrom ? formatDate(s.freeFrom, 'short') : '—'}
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {s.items.map(item => (
                <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex items-start gap-2">
                    {item.source === 'studio' ? (
                      <Film className="w-3.5 h-3.5 text-[#7a2e33] shrink-0 mt-0.5" />
                    ) : (
                      <Briefcase className="w-3.5 h-3.5 text-sky-800 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-[#111417] truncate">{item.title}</div>
                      <div className="text-[10px] text-[#6b6660] truncate">
                        {item.forName} · {item.source === 'studio' ? 'Studio' : 'Freelance'}
                        {item.inProgress && ' · in progress'}
                        {!item.reservesCapacity && ' · revisions / with client'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {!item.reservesCapacity ? (
                      <>
                        <div className="text-[11px] font-bold text-sky-800">
                          {item.promisedDate ? `Due ${formatDate(item.promisedDate, 'short')}` : 'With client'}
                        </div>
                        <div className="text-[10px] text-[#6b6660]">No slot held — fitted in</div>
                      </>
                    ) : item.unestimated ? (
                      <span className="text-[10px] font-bold text-amber-800">Needs an estimate</span>
                    ) : (
                      <>
                        <div className={`font-bold ${item.late ? 'text-rose-700' : 'text-[#111417]'}`}>
                          {formatDate(item.finishDate!, 'short')}
                        </div>
                        <div className="text-[10px] text-[#6b6660]">
                          {item.effortHours}h · starts {formatDate(item.startDate!, 'short')}
                        </div>
                        {item.late && item.promisedDate && (
                          <div className="text-[10px] font-bold text-rose-700">
                            past {formatDate(item.promisedDate, 'short')}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {s.items.length === 0 && (
                <div className="px-4 py-3 text-[11px] text-[#6b6660] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Nothing queued.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
