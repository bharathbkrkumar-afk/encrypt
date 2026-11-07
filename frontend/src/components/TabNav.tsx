import React from 'react';
import { Lock, Unlock, Mail } from 'lucide-react';
import { ActiveTab } from '../types/crypto';

interface TabNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const TabNav: React.FC<TabNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    {
      id: 'encrypt' as ActiveTab,
      label: 'Encrypt Image',
      icon: Lock,
      description: 'Lock image with AES-256-GCM',
    },
    {
      id: 'decrypt' as ActiveTab,
      label: 'Decrypt Image',
      icon: Unlock,
      description: 'Restore encrypted .secimg or legacy files',
    },
    {
      id: 'share' as ActiveTab,
      label: 'Email Encrypted Image',
      icon: Mail,
      description: 'Send encrypted image directly via email',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-dark-950 border border-dark-700 rounded-xl">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-150 ${
              isActive
                ? 'bg-dark-800 border border-brand-red text-white shadow-lg shadow-brand-red/10'
                : 'text-neutral-400 hover:text-white hover:bg-dark-850 border border-transparent'
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                isActive
                  ? 'bg-brand-red text-white'
                  : 'bg-dark-700 text-neutral-300'
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className="text-xs text-neutral-400 hidden lg:block">
                {tab.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

