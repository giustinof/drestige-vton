"use client"
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PackageOpen, Sparkles, X, Edit, Trash2, CalendarDays, Loader2, Save } from 'lucide-react';

export default function InventoryView({ viewMode, workerId, refreshKey }) {
  const [products, setProducts] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  // --- STATI MENU CONTESTUALE E MODIFICA ---
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, product: null });
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ model_code: '', variant_code: '', ean: '', collection_id: '', title: '', description: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  // --- REF PER LONG PRESS ---
  const touchTimeout = useRef(null);
  const isLongPress = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Carichiamo anche le stagioni per la modale di modifica
      const { data: seasonsData } = await supabase.from('collections').select('*').order('created_at', { ascending: false });
      if (seasonsData) setSeasons(seasonsData);

      // Aggiungiamo collections(*) alla query per avere il nome della stagione
      let query = supabase
        .from('products')
        .select(`*, product_images(id, url, type), collections(*)`)
        .order('created_at', { ascending: false });

      if (viewMode === 'my-products') {
        query = query.eq('worker_id', workerId);
      }

      const { data, error } = await query;
      if (!error && data) setProducts(data);
      setLoading(false);
    };

    fetchData();
  }, [viewMode, workerId, refreshKey]);

  // Chiudi il context menu se clicco fuori
  useEffect(() => {
    const handleClickOutside = () => setContextMenu({ visible: false, x: 0, y: 0, product: null });
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  // --- LOGICA LONG PRESS E RIGHT CLICK ---
  const handleContextMenuTrigger = (x, y, product) => {
    // Calcoliamo dimensioni ipotetiche del menu per non farlo uscire dallo schermo
    const menuWidth = 180; 
    const menuHeight = 110;
    const safeX = x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 16 : x;
    const safeY = y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 16 : y;

    setContextMenu({ visible: true, x: safeX, y: safeY, product });
  };

  const handleTouchStart = (e, product) => {
    isLongPress.current = false;
    touchTimeout.current = setTimeout(() => {
      isLongPress.current = true;
      handleContextMenuTrigger(e.touches[0].clientX, e.touches[0].clientY, product);
    }, 500); // 500ms per attivare il long press
  };

  const handleTouchEnd = () => { if (touchTimeout.current) clearTimeout(touchTimeout.current); };
  const handleTouchMove = () => { if (touchTimeout.current) clearTimeout(touchTimeout.current); };

  const handleRightClick = (e, product) => {
    e.preventDefault();
    handleContextMenuTrigger(e.clientX, e.clientY, product);
  };

  const handleProductClick = (product) => {
    if (isLongPress.current) return; // Se era un long press, ignora il click
    setSelectedProduct(product);
  };

  // --- LOGICA ELIMINAZIONE PROFONDA ---
  const handleDelete = async (product) => {
    if(!confirm(`Sei sicuro di voler eliminare DEFINITIVAMENTE il prodotto ${product.model_code}? Verranno cancellate anche le foto.`)) return;

    // 1. Estrapola i percorsi dei file nello storage dai link completi
    const pathsToDelete = product.product_images?.map(img => {
      try {
        const urlParts = img.url.split('/product-images/');
        return urlParts.length > 1 ? urlParts[1] : null;
      } catch (e) { return null; }
    }).filter(Boolean) || [];

    // 2. Elimina i file dallo storage Supabase se esistono
    if (pathsToDelete.length > 0) {
      const { error: storageError } = await supabase.storage.from('product-images').remove(pathsToDelete);
      if (storageError) console.error("Errore rimozione foto storage:", storageError);
    }

    // 3. Elimina il prodotto dal database (le cascade rules di Supabase dovrebbero eliminare le righe in product_images)
    const { error: dbError } = await supabase.from('products').delete().eq('id', product.id);
    
    if (!dbError) {
      setProducts(prev => prev.filter(p => p.id !== product.id));
    } else {
      alert("Errore durante l'eliminazione dal database.");
    }
  };

  // --- LOGICA MODIFICA ---
  const openEditModal = (product) => {
    setEditForm({
      model_code: product.model_code || '',
      variant_code: product.variant_code || '',
      ean: product.ean || '',
      collection_id: product.collection_id || '',
      title: product.title || '',
      description: product.description || ''
    });
    setEditingProduct(product);
  };

  const handleSaveEdit = async () => {
    setIsUpdating(true);
    const { error } = await supabase
      .from('products')
      .update({
        model_code: editForm.model_code,
        variant_code: editForm.variant_code,
        ean: editForm.ean,
        collection_id: editForm.collection_id,
        title: editForm.title,
        description: editForm.description
      })
      .eq('id', editingProduct.id);

    setIsUpdating(false);

    if (!error) {
      // Aggiorna la lista locale
      setProducts(prev => prev.map(p => {
        if (p.id === editingProduct.id) {
          const updatedCollection = seasons.find(s => s.id === editForm.collection_id) || p.collections;
          return { ...p, ...editForm, collections: updatedCollection };
        }
        return p;
      }));
      setEditingProduct(null);
    } else {
      alert("Errore durante il salvataggio.");
    }
  };


  if (loading) return <div className="text-center py-12 text-zinc-500 animate-pulse font-medium">Caricamento prodotti...</div>;

  return (
    <>
      <div className="p-4 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 relative">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-32 opacity-70">
            <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
              <PackageOpen size={36} className="text-zinc-400" strokeWidth={1.5} />
            </div>
            <p className="font-semibold text-zinc-900 text-lg">
              {viewMode === 'my-products' ? 'Non hai ancora inserito prodotti' : 'Nessun prodotto presente'}
            </p>
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
                  className="bg-white rounded-[1.25rem] p-2 shadow-sm border border-zinc-100 cursor-pointer active:scale-[0.98] transition-transform select-none"
                  onClick={() => handleProductClick(product)}
                  onContextMenu={(e) => handleRightClick(e, product)}
                  onTouchStart={(e) => handleTouchStart(e, product)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchMove}
                  onTouchCancel={handleTouchEnd}
                >
                  <div className="aspect-[3/4] rounded-xl bg-zinc-100 mb-3 overflow-hidden relative border border-zinc-50">
                    {coverImage ? (
                      <img src={coverImage} alt={product.model_code} className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300">
                        <PackageOpen size={24} />
                      </div>
                    )}
                    
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
      </div>

      {/* MENU CONTESTUALE (Right Click / Long Press) */}
      {contextMenu.visible && (
        <div 
          className="fixed z-50 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-100 p-1.5 flex flex-col min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()} // Previene la chiusura immediata se si clicca all'interno
        >
          <button 
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 rounded-xl transition-colors text-left"
            onClick={() => {
              openEditModal(contextMenu.product);
              setContextMenu({ visible: false, x: 0, y: 0, product: null });
            }}
          >
            <Edit size={16} /> Modifica
          </button>
          <div className="h-px bg-zinc-200/50 my-1 mx-2"></div>
          <button 
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
            onClick={() => {
              handleDelete(contextMenu.product);
            }}
          >
            <Trash2 size={16} /> Elimina
          </button>
        </div>
      )}

      {/* MODALE DI MODIFICA (Solo Dati + Collezione) */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setEditingProduct(null)}
              className="absolute top-4 right-4 p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            
            <h3 className="text-xl font-black text-zinc-900 mb-6">Modifica Prodotto</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Modello</label>
                <input 
                  type="text" value={editForm.model_code} onChange={e => setEditForm({...editForm, model_code: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Variante</label>
                <input 
                  type="text" value={editForm.variant_code} onChange={e => setEditForm({...editForm, variant_code: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Codice a Barre (EAN)</label>
                <input 
                  type="text" value={editForm.ean} onChange={e => setEditForm({...editForm, ean: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Stagione</label>
                <select 
                  value={editForm.collection_id} onChange={e => setEditForm({...editForm, collection_id: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none appearance-none"
                >
                  <option value="" disabled>Nessuna stagione</option>
                  {seasons.map(s => <option key={s.id} value={s.id}>{s.collection}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Titolo SEO</label>
                <input 
                  type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Descrizione Prodotto</label>
                <textarea 
                  rows={4}
                  value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none resize-none"
                />
              </div>
            </div>

            <button 
              onClick={handleSaveEdit}
              disabled={isUpdating}
              className="w-full mt-8 bg-zinc-900 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-50"
            >
              {isUpdating ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {isUpdating ? 'Salvataggio...' : 'Salva Modifiche'}
            </button>
          </div>
        </div>
      )}


      {/* MODALE DETTAGLIO PRODOTTO (Ora include la collezione) */}
      {selectedProduct && !editingProduct && (
        <div className="fixed inset-0 z-40 flex flex-col bg-zinc-50 animate-in slide-in-from-bottom-4 duration-200">
            <header className="px-6 py-4 border-b border-zinc-200/50 flex justify-between items-start bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div>
                    <h2 className="text-xl font-black text-zinc-900 leading-tight">{selectedProduct.model_code}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-zinc-500 font-medium">Var: {selectedProduct.variant_code}</p>
                      
                      {/* BADGE STAGIONE */}
                      {selectedProduct.collections && (
                        <>
                          <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
                          <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-md border border-zinc-200">
                            <CalendarDays size={12} /> {selectedProduct.collections.collection}
                          </span>
                        </>
                      )}
                    </div>
                </div>
                <button 
                  onClick={() => setSelectedProduct(null)} 
                  className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 active:scale-90 transition-transform mt-1"
                >
                    <X size={20} strokeWidth={2.5} />
                </button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 max-w-3xl mx-auto w-full pb-32">
                <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm">
                  <h3 className="font-black text-lg text-zinc-900 mb-2 leading-tight">
                    {selectedProduct.title || "Generazione titolo in corso..."}
                  </h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {selectedProduct.description || "L'Intelligenza Artificiale sta scrivendo la descrizione di questo prodotto. Potrebbe volerci qualche istante."}
                  </p>
                </section>
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

                <section>
                    <h3 className="font-bold text-lg mb-4 text-zinc-900">Scatti Originali</h3>
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

      {/* OVERLAY FOTO A SCHERMO INTERO */}
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
            alt="Fullscreen" 
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </>
  );
}