import React from "react";
import { 
  LayoutDashboard, 
  FileSearch, 
  Activity, 
  FileCode, 
  ClipboardList, 
  ShieldCheck, 
  CheckSquare 
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "investigations", label: "Investigations", icon: FileSearch },
    { id: "health", label: "API Health", icon: Activity },
    { id: "policies", label: "Policy Editor", icon: FileCode },
    { id: "logs", label: "Audit Logs", icon: ClipboardList },
  ];

  const secondaryItems = [
    { id: "safety", label: "Safety Checklist", icon: ShieldCheck },
    { id: "compliance", label: "Compliance", icon: CheckSquare },
  ];

  return (
    <aside id="sidebar-container" className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest font-mono">
          Investigator Ops
        </h2>
        <p className="text-xs text-gray-500 font-mono mt-1">
          QueueStorm v4.2
        </p>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-blue-700" : "text-gray-400"}`} />
              <span className="font-sans">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Controls & Compliance */}
      <div className="p-4 border-t border-gray-100 space-y-1">
        {secondaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              id={`nav-secondary-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <Icon className="w-4 h-4 text-gray-400" />
              <span className="font-sans">{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
