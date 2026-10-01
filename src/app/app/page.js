"use client"
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import NewProductPanel from '../../../components/NewProductPanel';
import Sidebar from '../../../components/Sidebar';
import InventoryView from '../../../components/InventoryView';
import SeasonsView from '../../../components/SeasonsView';
import { Plus, Menu } from 'lucide-react';

export default function AppHome() {
  const [worker, setWorker] = useState(null);
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Stati di Navigazione e Menu
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('inventory'); // 'inventory' | 'my-products' | 'seasons'
  const [refreshKey, setRefreshKey] = useState(0); // Usato per forzare l'aggiornamento della lista prodotti
  
  const [categories, setCategories] = useState([]);
  const [capturedTagFile, setCapturedTagFile] = useState(null);
  const [isNewProductPanelOpen, setIsNewProductPanelOpen] = useState(false);
  
  const tagCaptureRef = useRef(null);

  useEffect(() => {
    const initApp = async () => {
      const savedWorker = localStorage.getItem('drestige_worker');
      if (savedWorker) {
        setWorker(JSON.parse(savedWorker));
      }
      
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .order('gender', { ascending: false })
        .order('name');
        
      if (cats) setCategories(cats);
      
      setLoading(false);
    };
    
    initApp();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('code', inputCode.trim())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      setError('Codice non trovato o disattivato.');
    } else {
      localStorage.setItem('drestige_worker', JSON.stringify(data));
      setWorker(data);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('drestige_worker');
    setWorker(null);
    setIsSidebarOpen(false);
  };

  const handleInitialTagCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCapturedTagFile(file);
      setIsNewProductPanelOpen(true);
    }
    e.target.value = null; 
  };

  const handlePanelClose = () => {
    setIsNewProductPanelOpen(false);
    // Cambiamo la refreshKey per dire a InventoryView di ricaricare i dati dal database
    setRefreshKey(prev => prev + 1);
  }

  // Helper per il titolo della pagina in base alla vista
  const getPageTitle = () => {
    switch(currentView) {
      case 'inventory': return 'Tutto l\'inventario';
      case 'my-products': return 'I Tuoi Prodotti';
      case 'seasons': return 'Gestione Stagioni';
      default: return '';
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-900 font-medium">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-950 rounded-full animate-spin mb-4"></div>
        Caricamento...
      </div>
    </div>
  );

  // ---------- SCHERMATA LOGIN ----------
  if (!worker) {
    return (
      <div className="min-h-screen bg-[#09090b] relative flex flex-col items-center justify-center p-6 font-sans text-white overflow-hidden">
        {/* Schermata di login originale intatta... */}
        <div className="absolute top-0 left-0 right-0 h-[50vh] z-0 pointer-events-none">
          <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-100" style={{ backgroundImage: "url('/bg.jpg')" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#09090b]/80 to-[#09090b]" />
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-sm mx-auto w-full mb-12">
          <div className="w-24 h-24 mb-8 mx-auto">
            <img src="/logo.png" alt="Drestige Logo" className="w-full h-full object-contain drop-shadow-lg" />
          </div>
          <h2 className="text-[28px] font-bold mb-2 text-white tracking-tight text-center">Accedi a V-TON</h2>
          <p className="text-zinc-400 text-[15px] mb-8 text-center px-4 font-medium">Inserisci il tuo codice magazziniere.</p>
          <form onSubmit={handleLogin} className="space-y-6 w-full">
            <div>
              <input
                type="text"
                placeholder="Es. MAG-01"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-lg font-mono uppercase text-center text-white focus:ring-2 focus:ring-white/20 focus:border-white/30 outline-none placeholder:text-zinc-600 transition-all backdrop-blur-md"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                required
              />
              {error && <p className="text-red-400 text-sm mt-3 text-center font-medium animate-in fade-in slide-in-from-top-1">{error}</p>}
            </div>
            <div className="w-full relative pt-2">
              <div className="absolute inset-x-0 bottom-0 top-2 bg-white/20 blur-2xl rounded-full opacity-60 z-0 pointer-events-none"></div>
              <button type="submit" className="relative z-10 w-full bg-white text-black font-semibold text-[17px] py-4 rounded-full active:scale-[0.98] transition-transform">
                Accedi
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ---------- SCHERMATA PRINCIPALE ----------
  return (
    <div className="min-h-screen bg-zinc-50 relative">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        currentView={currentView}
        setCurrentView={setCurrentView}
        onLogout={handleLogout}
      />

      {/* Header con Hamburger */}
      <header className="px-6 pt-6 pb-4 sticky top-0 z-10 backdrop-blur-xl bg-zinc-50/80 border-b border-zinc-200/50 flex justify-between items-end">
        <div className="flex gap-4 items-center w-full">
          {/* Pulsante Hamburger */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-zinc-800 bg-white shadow-sm border border-zinc-200 rounded-full active:scale-95 transition-transform"
          >
            <Menu size={24} />
          </button>
          
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-0.5">Bentornato, {worker.name}</p>
            <h1 className="text-2xl font-black text-zinc-900 tracking-tight">{getPageTitle()}</h1>
          </div>
        </div>
      </header>

      {/* Rendering Condizionale dei Contenuti in base al Menu */}
      <main>
        {currentView === 'seasons' ? (
          <SeasonsView />
        ) : (
          <InventoryView 
            viewMode={currentView} 
            workerId={worker.id} 
            refreshKey={refreshKey}
          />
        )}
      </main>

      {/* FAB Pulsante Fluttuante (Nascondiamo il "+" se siamo nelle stagioni) */}
      {currentView !== 'seasons' && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none animate-in slide-in-from-bottom-8">
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            className="hidden" 
            ref={tagCaptureRef} 
            onChange={handleInitialTagCapture} 
          />
          <button 
            onClick={() => tagCaptureRef.current.click()} 
            className="pointer-events-auto w-16 h-16 bg-zinc-950 text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.25)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] active:scale-90 transition-all border-4 border-zinc-50"
          >
            <Plus size={32} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Modale Nuovo Prodotto */}
      {isNewProductPanelOpen && capturedTagFile && (
        <NewProductPanel 
          onClose={handlePanelClose} 
          workerId={worker.id}
          categories={categories}
          initialTagFile={capturedTagFile} 
        />
      )}
    </div>
  );
}