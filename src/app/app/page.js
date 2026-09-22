"use client"
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import NewProductPanel from '../../../components/NewProductPanel';
import { Plus, PackageOpen } from 'lucide-react';

export default function AppHome() {
  const [worker, setWorker] = useState(null);
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [categories, setCategories] = useState([]);
  const [capturedTagFile, setCapturedTagFile] = useState(null);
  const [isNewProductPanelOpen, setIsNewProductPanelOpen] = useState(false);

  const tagCaptureRef = useRef(null);

  useEffect(() => {
    const initApp = async () => {
      // 1. Controllo Login
      const savedWorker = localStorage.getItem('drestige_worker');
      if (savedWorker) {
        setWorker(JSON.parse(savedWorker));
      }
      
      // 2. Caricamento Categorie dal DB
      const { data: cats, error: catsError } = await supabase
        .from('categories')
        .select('*')
        .order('gender', { ascending: false })
        .order('name');
        
      if (!catsError && cats) {
        setCategories(cats);
      }
      
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

  const handleInitialTagCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCapturedTagFile(file);
      setIsNewProductPanelOpen(true);
    }
    e.target.value = null; 
  };

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center text-black font-semibold">Inizializzazione...</div>;

  if (!worker) {
    return (
      <div className="min-h-screen bg-white flex flex-col p-6">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <h2 className="text-3xl font-black mb-2 text-black">Identificati</h2>
          <p className="text-gray-500 mb-8">Inserisci il tuo codice magazziniere per iniziare il turno.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Codice operatore (Es. MAG-01)"
                className="w-full bg-gray-100 border-none rounded-2xl px-5 py-4 text-lg font-mono uppercase focus:ring-2 focus:ring-black outline-none placeholder:text-gray-400"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                required
              />
              {error && <p className="text-red-500 text-sm mt-2 ml-2 font-medium">{error}</p>}
            </div>
            
            <button type="submit" className="w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform">
              Inizia Turno
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Header Nativo */}
      <header className="bg-white px-6 pt-12 pb-4 sticky top-0 z-10 border-b border-gray-100 flex justify-between items-end">
        <div>
          <p className="text-sm font-medium text-gray-500">Ciao, {worker.name}</p>
          <h1 className="text-2xl font-black text-black tracking-tight">Il tuo inventario</h1>
        </div>
      </header>

      {/* Main Area */}
      <main className="p-6">
        <div className="flex flex-col items-center justify-center text-center py-20 opacity-50">
          <PackageOpen size={48} className="mb-4 text-gray-400" strokeWidth={1.5} />
          <p className="font-semibold text-gray-900">Nessun prodotto elaborato oggi</p>
          <p className="text-sm text-gray-500 mt-1">Premi il pulsante + per scattare un cartellino</p>
        </div>
      </main>

      {/* FAB Nativo */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-40">
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
          className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.2)] active:scale-90 transition-transform"
        >
          <Plus size={32} strokeWidth={2.5} />
        </button>
      </div>

      {isNewProductPanelOpen && capturedTagFile && (
        <NewProductPanel 
          onClose={() => setIsNewProductPanelOpen(false)} 
          workerId={worker.id}
          categories={categories}
          initialTagFile={capturedTagFile} 
        />
      )}
    </div>
  );
}