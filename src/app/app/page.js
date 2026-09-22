"use client"
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import NewProductPanel from '../../../components/NewProductPanel';
import { Plus, PackageOpen, X } from 'lucide-react';

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
  
  // --- NUOVO STATO PER LA FOTO A SCHERMO INTERO ---
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
    <div className="min-h-screen bg-white pb-32 relative">
      <header className="bg-white px-6 pt-12 pb-4 sticky top-0 z-10 border-b border-gray-100 flex justify-between items-end">
        <div>
          <p className="text-sm font-medium text-gray-500">Ciao, {worker.name}</p>
          <h1 className="text-2xl font-black text-black tracking-tight">Il tuo inventario</h1>
        </div>
      </header>

      <main className="p-4">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 opacity-50">
            <PackageOpen size={48} className="mb-4 text-gray-400" strokeWidth={1.5} />
            <p className="font-semibold text-gray-900">Nessun prodotto elaborato oggi</p>
            <p className="text-sm text-gray-500 mt-1">Premi il pulsante + per scattare un cartellino</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {products.map(product => {
              const processedImages = product.product_images?.filter(img => img.type === 'processed') || [];
              const rawImages = product.product_images?.filter(img => img.type === 'raw_item') || [];
              const coverImage = processedImages.length > 0 ? processedImages[0].url : (rawImages.length > 0 ? rawImages[0].url : null);
              
              return (
                <div 
                  key={product.id} 
                  className="bg-gray-50 rounded-2xl p-2 cursor-pointer active:scale-95 transition-transform"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="aspect-[3/4] rounded-xl bg-gray-200 mb-2 overflow-hidden relative">
                    {coverImage ? (
                      <img src={coverImage} alt={product.model_code} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">Nessuna Foto</div>
                    )}
                    
                    {product.status === 'processing' && processedImages.length === 0 && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
                            <span className="text-white text-xs font-bold px-2 py-1 bg-black/50 rounded-full animate-pulse">In AI...</span>
                        </div>
                    )}
                  </div>
                  <div className="px-1 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-bold text-gray-900 leading-tight">{product.model_code || 'Senza Codice'}</p>
                        <p className="text-xs text-gray-500">{product.variant_code}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-20">
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
          onClose={handlePanelClose} 
          workerId={worker.id}
          categories={categories}
          initialTagFile={capturedTagFile} 
        />
      )}

      {selectedProduct && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white">
            <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                    <h2 className="text-xl font-black text-black leading-tight">{selectedProduct.model_code}</h2>
                    <p className="text-sm text-gray-500">Variante: {selectedProduct.variant_code}</p>
                </div>
                <button onClick={() => setSelectedProduct(null)} className="p-2 bg-gray-100 rounded-full text-gray-500 active:scale-90 transition-transform">
                    <X size={20} strokeWidth={2.5} />
                </button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                <div>
                    <h3 className="font-bold text-lg mb-3">Foto Generate (AI)</h3>
                    {selectedProduct.product_images?.filter(img => img.type === 'processed').length > 0 ? (
                         <div className="grid grid-cols-2 gap-3">
                            {selectedProduct.product_images.filter(img => img.type === 'processed').map((img, i) => (
                                <div 
                                  key={i} 
                                  className="aspect-[3/4] bg-gray-100 rounded-xl overflow-hidden shadow-sm cursor-pointer active:opacity-75 transition-opacity"
                                  onClick={() => setFullscreenImage(img.url)}
                                >
                                    <img src={img.url} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    ) : (
                         <div className="p-4 bg-gray-50 rounded-xl text-center text-sm text-gray-500">
                             Nessuna immagine AI disponibile o ancora in elaborazione.
                         </div>
                    )}
                </div>

                <div>
                    <h3 className="font-bold text-lg mb-3">Scatti Originali</h3>
                    <div className="flex overflow-x-auto gap-3 pb-4 snap-x">
                         {selectedProduct.product_images?.filter(img => img.type !== 'processed').map((img, i) => (
                             <div 
                                key={i} 
                                className="flex-shrink-0 w-32 aspect-[3/4] bg-gray-100 rounded-xl overflow-hidden snap-start relative cursor-pointer active:opacity-75 transition-opacity"
                                onClick={() => setFullscreenImage(img.url)}
                             >
                                <img src={img.url} className="w-full h-full object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                     <p className="text-white text-xs font-bold uppercase">{img.type}</p>
                                </div>
                             </div>
                         ))}
                    </div>
                </div>

            </div>
        </div>
      )}

      {/* OVERLAY FOTO A SCHERMO INTERO */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setFullscreenImage(null)}
        >
          <button 
            onClick={() => setFullscreenImage(null)} 
            className="absolute top-6 right-6 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 active:scale-90 transition-all z-50"
          >
            <X size={24} strokeWidth={2.5} />
          </button>
          
          <img 
            src={fullscreenImage} 
            alt="Fullscreen view" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
}