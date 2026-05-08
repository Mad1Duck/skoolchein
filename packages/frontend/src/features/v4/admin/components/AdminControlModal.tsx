import { useState, useEffect } from 'react';
import { useAdminForceStatus, useAdminUpdateDates } from '@/lib/contracts/write-hooks';
import { type Program } from '@/lib/api';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoModal } from '@/components/ui/NeoModal';

// Simplified enum map matching the smart contract
const PROGRAM_STATUSES = [
  { value: 0, label: 'CREATED' },
  { value: 1, label: 'APPLICATION OPEN' },
  { value: 2, label: 'SCREENING' },
  { value: 3, label: 'VOTING' },
  { value: 4, label: 'ACTIVE' },
  { value: 5, label: 'COMPLETED' },
  { value: 6, label: 'CANCELLED' },
];

export function AdminControlModal({
  program,
  isOpen,
  onClose,
}: {
  program: Program;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'status' | 'dates'>('status');
  const [selectedStatus, setSelectedStatus] = useState<number>(0);

  const formatEpoch = (dateStr: string) => {
    if (!dateStr || dateStr === '0') return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  };

  const [dates, setDates] = useState({
    appStart: formatEpoch(program.applicationStart || ''),
    appEnd: formatEpoch(program.applicationEnd || ''),
    voteStart: formatEpoch(program.votingStart || ''),
    voteEnd: formatEpoch(program.votingEnd || ''),
  });

  const { adminForceStatus, isPending: forcing, isSuccess: forceSuccess } = useAdminForceStatus();
  const { adminUpdateDates, isPending: updating, isSuccess: updateSuccess } = useAdminUpdateDates();

  useEffect(() => {
    if (forceSuccess || updateSuccess) {
      onClose();
    }
  }, [forceSuccess, updateSuccess, onClose]);

  const handleForceStatus = () => {
    adminForceStatus(BigInt(program.pid), selectedStatus);
  };

  const handleUpdateDates = () => {
    const getEpoch = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
    adminUpdateDates(
      BigInt(program.pid),
      BigInt(getEpoch(dates.appStart)),
      BigInt(getEpoch(dates.appEnd)),
      BigInt(getEpoch(dates.voteStart)),
      BigInt(getEpoch(dates.voteEnd)),
    );
  };

  const isPending = forcing || updating;

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={`Admin: Program ${program.pid}`}>
      <div className="flex gap-2 mb-6">
        <button
          className={`flex-1 py-2 font-bold rounded-lg border-2 border-black transition-colors ${
            activeTab === 'status'
              ? 'bg-skpurple text-white shadow-[2px_2px_0px_rgba(0,0,0,1)]'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('status')}>
          Force Status
        </button>
        <button
          className={`flex-1 py-2 font-bold rounded-lg border-2 border-black transition-colors ${
            activeTab === 'dates'
              ? 'bg-skpurple text-white shadow-[2px_2px_0px_rgba(0,0,0,1)]'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('dates')}>
          Update Dates
        </button>
      </div>

      {activeTab === 'status' ? (
        <div className="space-y-4">
          <div className="p-3 bg-gray-100 border-2 border-black rounded-xl">
            <p className="text-xs font-bold text-gray-500 uppercase">Current Status</p>
            <p className="font-paytone text-xl">{program.status.replace('_', ' ')}</p>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Target Status</label>
            <select
              className="w-full p-3 rounded-lg border-2 border-black neo-shadow-sm font-bold bg-white focus:outline-none focus:border-skpurple"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(Number(e.target.value))}>
              {PROGRAM_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value} - {s.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-red-500 font-bold mt-1 uppercase italic">
              Warning: Side-effects (like fund locking) may not run during forced bypass.
            </p>
          </div>

          <NeoButton
            label={forcing ? 'Forcing...' : 'Execute Force Status'}
            variant="danger"
            fullWidth
            loading={forcing}
            disabled={isPending}
            onClick={handleForceStatus}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">Application Start</label>
              <input
                type="datetime-local"
                value={dates.appStart}
                onChange={(e) => setDates((d) => ({ ...d, appStart: e.target.value }))}
                className="w-full p-2 border-2 text-sm border-black rounded-lg neo-shadow-sm focus:outline-none focus:border-skpurple"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Application End</label>
              <input
                type="datetime-local"
                value={dates.appEnd}
                onChange={(e) => setDates((d) => ({ ...d, appEnd: e.target.value }))}
                className="w-full p-2 border-2 text-sm border-black rounded-lg neo-shadow-sm focus:outline-none focus:border-skpurple"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Voting Start</label>
              <input
                type="datetime-local"
                value={dates.voteStart}
                onChange={(e) => setDates((d) => ({ ...d, voteStart: e.target.value }))}
                className="w-full p-2 border-2 text-sm border-black rounded-lg neo-shadow-sm focus:outline-none focus:border-skpurple"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Voting End</label>
              <input
                type="datetime-local"
                value={dates.voteEnd}
                onChange={(e) => setDates((d) => ({ ...d, voteEnd: e.target.value }))}
                className="w-full p-2 border-2 text-sm border-black rounded-lg neo-shadow-sm focus:outline-none focus:border-skpurple"
              />
            </div>
          </div>
          <NeoButton
            label={updating ? 'Updating...' : 'Execute Date Update'}
            variant="secondary"
            fullWidth
            loading={updating}
            disabled={isPending}
            onClick={handleUpdateDates}
          />
        </div>
      )}
    </NeoModal>
  );
}
