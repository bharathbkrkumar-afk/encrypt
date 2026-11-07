import React, { useState } from 'react';
import { TabNav } from './components/TabNav';
import { EncryptCard } from './components/EncryptCard';
import { DecryptCard } from './components/DecryptCard';
import { ShareCard } from './components/ShareCard';
import { ActivityLog } from './components/ActivityLog';
import { ActiveTab, EncryptionResult, LogEntry } from './types/crypto';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('encrypt');
  const [shareData, setShareData] = useState<EncryptionResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'Image Encryptor Web initialized. Web Crypto API ready (AES-256-GCM mode).'
    }
  ]);

  const addLog = (type: LogEntry['type'], message: string) => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    setLogs((prev) => [entry, ...prev.slice(0, 99)]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="min-h-screen bg-dark-900 text-neutral-100 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Tabs */}
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main Grid: Left Column (Active Tool) & Right Column (Activity Logs) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Action Area (7 cols on desktop) */}
          <div className="lg:col-span-7 space-y-6">
            {activeTab === 'encrypt' && (
              <EncryptCard
                onAddLog={addLog}
                onSetShareData={(res) => setShareData(res)}
                onNavigateToShare={() => setActiveTab('share')}
              />
            )}

            {activeTab === 'decrypt' && (
              <DecryptCard onAddLog={addLog} />
            )}

            {activeTab === 'share' && (
              <ShareCard
                shareData={shareData}
                onAddLog={addLog}
                onNavigateToEncrypt={() => setActiveTab('encrypt')}
              />
            )}
          </div>

          {/* Activity Logs (5 cols on desktop) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="h-[460px] lg:sticky lg:top-6">
              <ActivityLog logs={logs} onClear={handleClearLogs} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
