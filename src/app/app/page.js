"use client"
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import NewProductPanel from '../../../components/NewProductPanel';
import Sidebar from '../../../components/Sidebar';
import InventoryView from '../../../components/InventoryView';
import SeasonsView from '../../../components/SeasonsView';
import { Plus, Menu, Search, X, ScanLine } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

// --- COMPONENTE SCANNER EAN ---
function BarcodeScannerModal({ onClose, onScan }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("reader", { 
      qrbox: { width: 280, height: 120 }, 
      fps: 10,
      aspectRatio: 1.0
    }, false);
    
    scanner.render(
      (decodedText) => {
        scanner.clear();
        onScan(decodedText);
      },
      (error) => { /* Ignora log */ }
    );
    
    return () => { scanner.clear().catch(() => {}); };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
      <button onClick={onClose} className="absolute top-6 right-6 text-white p-3 bg-white/10 hover:bg-white/20 active:scale-95 rounded-full transition-all">
        <X size={24} strokeWidth={2.5} />
      </button>
      <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-6">
        <ScanLine size={32} />
      </div>
      <h3 className="text-white text-xl font-bold mb-2">Inquadra il Codice a Barre</h3>
      <p className="text-zinc-400 text-sm mb-8">L'EAN verrà scansionato automaticamente</p>
      
      <div className="w-full max-w-sm rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl bg-black">
        <div id="reader" className="w-full"></div>
      </div>
    </div>
  );
}

export default function AppHome() {
  const [worker, setWorker] = useState(null);
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('inventory'); 
  const [refreshKey, setRefreshKey] = useState(0); 
  
  const [searchQuery, setSearchQuery] = useState(''); 
  const [activeFilter, setActiveFilter] = useState('all');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedEan, setScannedEan] = useState(''); 
  
  const [categories, setCategories] = useState([]);
  const [capturedTagFile, setCapturedTagFile] = useState(null);
  const [isNewProductPanelOpen, setIsNewProductPanelOpen] = useState(false);
  
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const tagCaptureRef = useRef(null);

  // AGGIUNTO FILTRO SCARICATI
  const filterOptions = [
    { id: 'all', label: 'Tutti' },
    { id: 'processing', label: 'In Elaborazione' },
    { id: 'done', label: 'Pronti' },
    { id: 'no-photo', label: 'Senza Foto' },
    { id: 'downloaded', label: 'Scaricati (Archivio)' } 
  ];

  useEffect(() => {
    const initApp = async () => {
      const savedWorker = localStorage.getItem('drestige_worker');
      if (savedWorker) setWorker(JSON.parse(savedWorker));
      const { data: cats } = await supabase.from('categories').select('*').order('gender', { ascending: false }).order('name');
      if (cats) setCategories(cats);
      setLoading(false);
    };
    initApp();
  }, []);

  useEffect(() => {
    const handlePopState = (e) => {
      const modalState = e.state?.modalOpen;
      setIsNewProductPanelOpen(modalState === 'newProduct');
      setIsSidebarOpen(modalState === 'sidebar');
      setIsChangelogOpen(modalState === 'changelog');
      setIsScannerOpen(modalState === 'scanner');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openSidebar = () => { window.history.pushState({ modalOpen: 'sidebar' }, ''); setIsSidebarOpen(true); };
  const closeSidebar = () => { if (window.history.state?.modalOpen === 'sidebar') window.history.back(); else setIsSidebarOpen(false); };
  const openScanner = () => { window.history.pushState({ modalOpen: 'scanner' }, ''); setIsScannerOpen(true); };
  const closeScanner = () => { if (window.history.state?.modalOpen === 'scanner') window.history.back(); else setIsScannerOpen(false); };
  const handleScanSuccess = (ean) => { closeScanner(); setSearchQuery(ean); setScannedEan(ean); };

  const openChangelog = async () => {
    window.history.pushState({ modalOpen: 'changelog' }, ''); setIsChangelogOpen(true); setLoadingVersions(true);
    const { data } = await supabase.from('versions').select('*').order('created_at', { ascending: false });
    if(data) setVersions(data);
    setLoadingVersions(false);
  };
  const closeChangelog = () => { if (window.history.state?.modalOpen === 'changelog') window.history.back(); else setIsChangelogOpen(false); };
  const handlePanelClose = () => { if (window.history.state?.modalOpen === 'newProduct') window.history.back(); else setIsNewProductPanelOpen(false); setRefreshKey(prev => prev + 1); };

  const handleLogin = async (e) => {
    e.preventDefault(); setError('');
    const { data, error } = await supabase.from('workers').select('*').eq('code', inputCode.trim()).eq('is_active', true).single();
    if (error || !data) setError('Codice errato.'); else { localStorage.setItem('drestige_worker', JSON.stringify(data)); setWorker(data); }
  };
  const handleLogout = () => { localStorage.removeItem('drestige_worker'); setWorker(null); setIsSidebarOpen(false); };

  const handleInitialTagCapture = (e) => {
    const file = e.target.files[0];
    if (file) { setCapturedTagFile(file); window.history.pushState({ modalOpen: 'newProduct' }, ''); setIsNewProductPanelOpen(true); }
    e.target.value = null; 
  };

  if (loading) return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-medium">Caricamento...</div>;

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

  return (
    <div className="min-h-screen bg-zinc-50 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} currentView={currentView} setCurrentView={setCurrentView} onLogout={handleLogout} onVersionClick={openChangelog} />

      <header className="px-6 pt-6 pb-2 sticky top-0 z-10 backdrop-blur-xl bg-zinc-50/90 border-b border-zinc-200/50 flex flex-col gap-3">
        <div className="flex justify-between items-end w-full">
          <div className="flex gap-4 items-center">
            <button onClick={openSidebar} className="p-2 -ml-2 text-zinc-800 bg-white shadow-sm border border-zinc-200 rounded-full active:scale-95"><Menu size={24} /></button>
            <div>
              <p className="text-sm font-medium text-zinc-500 mb-0.5">Bentornato, {worker.name}</p>
              <h1 className="text-2xl font-black text-zinc-900 tracking-tight">{searchQuery ? 'Ricerca' : currentView === 'inventory' ? 'Inventario' : 'Stagioni'}</h1>
            </div>
          </div>
        </div>

        {currentView !== 'seasons' && (
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input type="text" placeholder="Cerca EAN o modello..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-12 py-3 text-sm font-medium text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm" />
            <button onClick={openScanner} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200"><ScanLine size={18} /></button>
          </div>
        )}

        {currentView !== 'seasons' && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
            {filterOptions.map(f => (
              <button key={f.id} onClick={() => setActiveFilter(f.id)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${activeFilter === f.id ? 'bg-zinc-900 text-white border-zinc-900 shadow-md' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main>
        {currentView === 'seasons' ? <SeasonsView /> : (
          <InventoryView 
            viewMode={currentView} 
            workerId={worker.id} 
            refreshKey={refreshKey} 
            searchQuery={searchQuery} 
            activeFilter={activeFilter} 
            scannedEan={scannedEan} 
            setScannedEan={setScannedEan} 
            onRedoProduct={(eanOrModel) => {
              if (tagCaptureRef.current) {
                tagCaptureRef.current.click();
              }
            }}
          />
        )}
      </main>

      {currentView !== 'seasons' && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none animate-in slide-in-from-bottom-8">
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={tagCaptureRef} onChange={handleInitialTagCapture} />
          <button onClick={() => tagCaptureRef.current.click()} className="pointer-events-auto w-16 h-16 bg-zinc-950 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 border-4 border-zinc-50"><Plus size={32} strokeWidth={2.5} /></button>
        </div>
      )}

      {isNewProductPanelOpen && capturedTagFile && <NewProductPanel onClose={handlePanelClose} workerId={worker.id} categories={categories} initialTagFile={capturedTagFile} />}
      {isScannerOpen && <BarcodeScannerModal onClose={closeScanner} onScan={handleScanSuccess} />}
      
      {isChangelogOpen && (
         <div className="fixed inset-0 z-[100] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
           {/* Modal Changelog invariato */}
           <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <header className="p-5 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 sticky top-0 z-10">
              <h3 className="text-xl font-black text-zinc-900">Changelog Versioni</h3>
              <button onClick={closeChangelog} className="p-2 bg-white border border-zinc-200 text-zinc-500 rounded-full shadow-sm hover:bg-zinc-100 transition-colors">
                <X size={18} strokeWidth={2.5} />
              </button>
            </header>
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              {loadingVersions ? (
                <p className="text-center text-zinc-500 animate-pulse font-medium">Caricamento versioni...</p>
              ) : versions.length === 0 ? (
                <p className="text-center text-zinc-500">Nessuna versione trovata.</p>
              ) : (
                versions.map((v, index) => (
                  <div key={v.id} className="relative pl-6 border-l-[3px] border-zinc-100">
                    <div className={`absolute w-4 h-4 rounded-full -left-[9.5px] top-1 border-[3px] border-white shadow-sm ${index === 0 ? 'bg-indigo-500' : 'bg-zinc-300'}`}></div>
                    <h4 className="font-bold text-zinc-900 text-lg">{v.name}</h4>
                    <p className="text-xs text-zinc-500 font-bold mb-3">{new Date(v.created_at).toLocaleDateString('it-IT')}</p>
                    <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">{v.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
         </div>
      )}
    </div>
  );
}