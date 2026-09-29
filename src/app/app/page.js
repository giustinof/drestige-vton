"use client"
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import NewProductPanel from '../../../components/NewProductPanel';
import { Plus, PackageOpen, X, Sparkles } from 'lucide-react';

export default function AppHome() {
  const [worker, setWorker] = useState(null);
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [categories, setCategories] = useState([]);
  const [capturedTagFile, setCapturedTagFile] = useState(null);
  const [isNewProductPanelOpen, setIsNewProductPanelOpen] = useState(false);
  
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const [fullscreenImage, setFullscreenImage] = useState(null);

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

  useEffect(() => {
    const fetchProducts = async () => {
      if (!worker) return;

      const { data: prods, error: prodsError } = await supabase
        .from('products')
        .select(`
          *,
          product_images (
            id,
            url,
            type
          )
        `)
        .eq('worker_id', worker.id)
        .order('created_at', { ascending: false });

      if (prodsError) {
        console.error("Errore caricamento prodotti:", prodsError);
      } else if (prods) {
        setProducts(prods);
      }
    };

    fetchProducts();
  }, [worker]);

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

  const handlePanelClose = async () => {
    setIsNewProductPanelOpen(false);
    if (worker) {
         const { data } = await supabase
        .from('products')
        .select(`*, product_images(id, url, type)`)
        .eq('worker_id', worker.id)
        .order('created_at', { ascending: false });
        if(data) setProducts(data);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-900 font-medium">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-950 rounded-full animate-spin mb-4"></div>
        Caricamento...
      </div>
    </div>
  );

  if (!worker) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col p-6">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-100 my-auto">
          <div className="w-16 h-16 bg-zinc-950 text-white rounded-2xl flex items-center justify-center text-2xl font-black mb-6">D.</div>
          <h2 className="text-3xl font-black mb-2 text-zinc-900 tracking-tight">Accesso V-TON</h2>
          <p className="text-zinc-500 mb-8 leading-relaxed">Inserisci il tuo codice magazziniere per iniziare la sessione fotografica.</p>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <input
                type="text"
                placeholder="Es. MAG-01"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-lg font-mono uppercase focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none placeholder:text-zinc-400 transition-all"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                required
              />
              {error && <p className="text-red-500 text-sm mt-2 ml-2 font-medium">{error}</p>}
            </div>
            
            <button type="submit" className="w-full bg-zinc-950 text-white font-bold text-lg py-4 rounded-2xl active:scale-[0.98] transition-all shadow-md hover:bg-zinc-800">
              Inizia Turno
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-32 relative">
      {/* Header Glassmorphism */}
      <header className="px-6 pt-12 pb-4 sticky top-0 z-10 backdrop-blur-xl bg-zinc-50/80 border-b border-zinc-200/50 flex justify-between items-end">
        <div>
          <p className="text-sm font-medium text-zinc-500 mb-1">Bentornato, {worker.name}</p>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Il tuo inventario</h1>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-32 opacity-70">
            <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
              <PackageOpen size={36} className="text-zinc-400" strokeWidth={1.5} />
            </div>
            <p className="font-semibold text-zinc-900 text-lg">Nessun prodotto elaborato</p>
            <p className="text-sm text-zinc-500 mt-2 max-w-[200px]">Tocca il pulsante + per scattare la foto a un cartellino.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {products.map(product => {
              const processedImages = product.product_images?.filter(img => img.type === 'processed') || [];
              const rawImages = product.product_images?.filter(img => img.type === 'raw_item') || [];
              const coverImage = processedImages.length > 0 ? processedImages[0].url : (rawImages.length > 0 ? rawImages[0].url : null);
              
              return (
                <div 
                  key={product.id} 
                  className="bg-white rounded-[1.25rem] p-2 shadow-sm border border-zinc-100 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="aspect-[3/4] rounded-xl bg-zinc-100 mb-3 overflow-hidden relative border border-zinc-50">
                    {coverImage ? (
                      <img src={coverImage} alt={product.model_code} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300">
                        <PackageOpen size={24} />
                      </div>
                    )}
                    
                    {/* Badge AI Elaborazione */}
                    {product.status === 'processing' && processedImages.length === 0 && (
                        <div className="absolute inset-0 bg-zinc-900/20 backdrop-blur-[2px] flex items-center justify-center">
                            <span className="flex items-center gap-1.5 text-indigo-50 text-xs font-bold px-3 py-1.5 bg-indigo-600/90 rounded-full shadow-lg shadow-indigo-900/20">
                              <Sparkles size={12} className="animate-pulse" /> Elaborazione AI
                            </span>
                        </div>
                    )}
                  </div>
                  <div className="px-2 pb-1">
                    <p className="text-sm font-bold text-zinc-900 leading-tight truncate">{product.model_code || 'Senza Codice'}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{product.variant_code}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Pulsante Fluttuante (FAB) migliorato */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none">
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

      {isNewProductPanelOpen && capturedTagFile && (
        <NewProductPanel 
          onClose={handlePanelClose} 
          workerId={worker.id}
          categories={categories}
          initialTagFile={capturedTagFile} 
        />
      )}

      {/* Modale Dettaglio Prodotto */}
      {selectedProduct && (
        <div className="fixed inset-0 z-40 flex flex-col bg-zinc-50 animate-in slide-in-from-bottom-4 duration-200">
            <header className="px-6 py-4 border-b border-zinc-200/50 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div>
                    <h2 className="text-xl font-black text-zinc-900 leading-tight">{selectedProduct.model_code}</h2>
                    <p className="text-sm text-zinc-500 font-medium">Var: {selectedProduct.variant_code}</p>
                </div>
                <button 
                  onClick={() => setSelectedProduct(null)} 
                  className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 active:scale-90 transition-transform"
                >
                    <X size={20} strokeWidth={2.5} />
                </button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 max-w-3xl mx-auto w-full">
                
                {/* Sezione V-TON */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={18} className="text-indigo-500" />
                      <h3 className="font-bold text-lg text-zinc-900">Virtual Try-On (AI)</h3>
                    </div>
                    
                    {selectedProduct.product_images?.filter(img => img.type === 'processed').length > 0 ? (
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {selectedProduct.product_images.filter(img => img.type === 'processed').map((img, i) => (
                                <div 
                                  key={i} 
                                  className="aspect-[3/4] bg-white rounded-2xl overflow-hidden shadow-sm border border-zinc-100 cursor-zoom-in active:opacity-75 transition-opacity"
                                  onClick={() => setFullscreenImage(img.url)}
                                >
                                    <img src={img.url} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    ) : (
                         <div className="p-6 bg-white border border-zinc-100 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
                             <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-2">
                               <Sparkles size={24} />
                             </div>
                             <p className="text-sm font-medium text-zinc-600">Nessuna foto generata</p>
                             <p className="text-xs text-zinc-400">Le immagini V-TON appariranno qui a fine elaborazione.</p>
                         </div>
                    )}
                </section>

                {/* Sezione Scatti Originali */}
                <section>
                    <h3 className="font-bold text-lg mb-4 text-zinc-900">Scatti Originali Magazzino</h3>
                    {/* Hide-scrollbar className personalizzata utile qui (da aggiungere in globals.css se non presente: .hide-scrollbar::-webkit-scrollbar { display: none; }) */}
                    <div className="flex overflow-x-auto gap-3 pb-4 snap-x hide-scrollbar">
                         {selectedProduct.product_images?.filter(img => img.type !== 'processed').map((img, i) => (
                             <div 
                                key={i} 
                                className="flex-shrink-0 w-36 aspect-[3/4] bg-white rounded-2xl overflow-hidden snap-start relative cursor-zoom-in border border-zinc-200 active:opacity-75 transition-opacity"
                                onClick={() => setFullscreenImage(img.url)}
                             >
                                <img src={img.url} className="w-full h-full object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-900/80 via-zinc-900/30 to-transparent p-3 pt-8">
                                     <p className="text-white text-[10px] tracking-wider font-bold uppercase">{img.type.replace('_', ' ')}</p>
                                </div>
                             </div>
                         ))}
                    </div>
                </section>
            </div>
        </div>
      )}

      {/* OVERLAY FOTO A SCHERMO INTERO (Più immersivo) */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-50 bg-zinc-950/95 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setFullscreenImage(null)}
        >
          <button 
            onClick={() => setFullscreenImage(null)} 
            className="absolute top-6 right-6 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all z-50 backdrop-blur-lg"
          >
            <X size={24} strokeWidth={2.5} />
          </button>
          
          <img 
            src={fullscreenImage} 
            alt="Dettaglio a schermo intero" 
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
}