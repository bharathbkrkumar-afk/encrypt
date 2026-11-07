import React from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import { LogEntry } from '../types/crypto';

interface ActivityLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ logs, onClear }) => {
  return (
    <div className="bg-dark-950 border border-dark-700 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="px-4 py-2.5 bg-dark-900 border-b border-dark-700 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
          <Terminal className="w-4 h-4 text-brand-red" />
          <span>Activity Log</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-dark-750 text-neutral-400 font-mono">
            {logs.length}
          </span>
        </div>
        {logs.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition"
            title="Clear Log"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      <div className="p-3 font-mono text-xs overflow-y-auto max-h-60 sm:max-h-80 flex-1 space-y-1.5 bg-dark-950/90">
        {logs.length === 0 ? (
          <div className="text-neutral-500 italic py-6 text-center">
            No activity yet. Encrypt or decrypt an image to view execution logs.
          </div>
        ) : (
          logs.map((log) => {
            let badgeClass = 'text-blue-400 bg-blue-950/40 border-blue-900/40';
            if (log.type === 'success') {
              badgeClass = 'text-emerald-400 bg-emerald-950/40 border-emerald-900/40';
            } else if (log.type === 'warning') {
              badgeClass = 'text-amber-400 bg-amber-950/40 border-amber-900/40';
            } else if (log.type === 'error') {
              badgeClass = 'text-red-400 bg-red-950/40 border-red-900/40';
            }

            return (
              <div
                key={log.id}
                className="flex items-start gap-2 py-0.5 border-b border-dark-900/50 last:border-none"
              >
                <span className="text-[10px] text-neutral-500 shrink-0 select-none">
                  [{log.timestamp}]
                </span>
                <span
                  className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border shrink-0 ${badgeClass}`}
                >
                  {log.type}
                </span>
                <span className="text-neutral-200 break-all">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

