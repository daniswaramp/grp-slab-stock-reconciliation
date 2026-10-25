import React from 'react';
import { LayoutDashboard, Box, ListChecks, Settings, Database, Info } from 'lucide-react';
import { useI18n } from '../i18n';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const { t } = useI18n();

  const tabs = [
    { id: 'Dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'Opname Slab', label: t.nav.opnameSlab, icon: Box },
    { id: 'Opname List', label: t.nav.opnameList, icon: ListChecks },
    { id: 'Setting', label: t.nav.setting, icon: Settings },
    { id: 'Database', label: t.nav.database, icon: Database },
    { id: 'About', label: t.nav.about, icon: Info },
  ];

  return (
    <div className="bg-white border-b border-gray-100 overflow-x-auto shadow-sm touch-pan-x scrollbar-none">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 flex gap-0.5 sm:gap-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-4 text-[11px] sm:text-xs font-black transition-all whitespace-nowrap border-b-2 sm:border-b-4 uppercase tracking-wider shrink-0 select-none ${
                isActive 
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40' 
                  : 'border-transparent text-gray-400 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon size={15} className="shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Navigation;
