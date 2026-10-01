"use client"
import { Package, User, CalendarDays, LogOut, X } from 'lucide-react';

export default function Sidebar({ isOpen, onClose, currentView, setCurrentView, onLogout }) {
  const menuItems = [
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'my-products', label: 'I Miei Prodotti', icon: User },
    { id: 'seasons', label: 'Stagioni', icon: CalendarDays },
  ];

  return (
    <>
      {/* Overlay scuro */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar vera e propria */}
      <div className={`fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex justify-between items-center border-b border-zinc-100">
          <div className="w-24 h-8">
            <img src="/logo.png" alt="Drestige Logo" className="w-full h-full object-contain filter invert" />
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 bg-zinc-50 rounded-full">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  isActive 
                    ? 'bg-zinc-900 text-white' 
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Icon size={20} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-red-600 hover:bg-red-50 transition-colors mb-4"
          >
            <LogOut size={20} />
            Logout
          </button>
          <div className="text-center">
            <p className="text-xs text-zinc-400 font-medium">Drestige V-TON v.1.0</p>
          </div>
        </div>
      </div>
    </>
  );
}