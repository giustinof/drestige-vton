"use client"
import { useState, useEffect } from 'react';
import { Camera, X, Loader2, Check, Info } from 'lucide-react';
import { supabase } from '../lib/supabase'; 

export default function NewProductPanel({ onClose, workerId, categories, initialTagFile }) {
  const [productImages, setProductImages] = useState([]); 
  
  const [formData, setFormData] = useState({
    model_code: '',
    variant_code: '',
    ean: '',
    category_id: ''
  });
  
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');

  const [isOcrProcessing, setIsOcrProcessing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isAccessory = categories.find(c => c.id === formData.category_id)?.gender?.toLowerCase() === 'unisex';
  
  const accessoryPoses = [
    { angle: 'front', label: 'Fronte' },
    { angle: 'side', label: 'Lato Esterno' },
    { angle: 'back', label: 'Retro' },
    { angle: 'top', label: 'Dall\'alto' },
    { angle: 'detail', label: 'Dettaglio / Logo' },
    { angle: 'sole', label: 'Suola / Interno' }
  ];

  const clothingPoses = [
    { angle: 'front', label: 'Fronte (Flat Lay)', required: true },
    { angle: 'back', label: 'Retro (Flat Lay)', required: true },
    { angle: 'inner_tag', label: 'Etichetta Interna', required: false },
    { angle: 'detail_1', label: 'Dettaglio 1', required: false },
    { angle: 'detail_2', label: 'Dettaglio 2', required: false }
  ];

  // 0. Fetch Stagioni
  useEffect(() => {
    const fetchSeasons = async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data && data.length > 0) {
        setSeasons(data);
        setSelectedSeason(data[0].id); 
      }
    };
    fetchSeasons();
  }, []);

  // 1. OCR Iniziale
  useEffect(() => {
    const processTag = async () => {
      try {
        const payload = new FormData();
        payload.append('image', initialTagFile);
        const response = await fetch('/api/parse-tag', { method: 'POST', body: payload });
        if (!response.ok) throw new Error('Errore OCR');
        const data = await response.json();
        setFormData(prev => ({ ...prev, model_code: data.model_code || '', variant_code: data.variant_code || '', ean: data.ean || '' }));
      } catch (error) {
        console.error("Errore OCR:", error);
      } finally {
        setIsOcrProcessing(false);
      }
    };
    processTag();
  }, [initialTagFile]);

  // 2. Acquisizione guidata
  const handleProductCapture = (e, angle) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setProductImages(prev => {
      const existing = prev.filter(p => p.angle !== angle);
      return [...existing, { file, preview: URL.createObjectURL(file), angle }];
    });
    
    e.target.value = null; 
  };

  // 3. Salvataggio
  const handleSave = async () => {
    if (!formData.category_id) return alert("Devi selezionare una categoria.");
    if (!selectedSeason) return alert("Devi selezionare una stagione.");
    
    if (!isAccessory) {
      const hasFront = productImages.some(img => img.angle === 'front');
      const hasBack = productImages.some(img => img.angle === 'back');
      if (!hasFront || !hasBack) return alert("Per l'abbigliamento devi scattare almeno Fronte e Retro.");
    } else {
      if (productImages.length === 0) return alert("Aggiungi almeno una foto del prodotto.");
    }

    setIsSaving(true);
    try {
      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert([{
          worker_id: workerId,
          category_id: formData.category_id,
          collection_id: selectedSeason,
          model_code: formData.model_code,
          variant_code: formData.variant_code,
          ean: formData.ean,
          status: 'processing',
        }]).select().single();

      if (productError) throw productError;
      const productId = newProduct.id;

      const uploadFile = async (file, type, angle = 'none') => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${productId}_${type}_${angle}_${Date.now()}.${fileExt}`;
        const filePath = `${productId}/${fileName}`;
        
        const { error } = await supabase.storage.from('product-images').upload(filePath, file);
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
        return { url: publicUrl, type, angle };
      };

      const uploadPromises = [
        uploadFile(initialTagFile, 'tag', 'none'),
        ...productImages.map(img => uploadFile(img.file, 'raw_item', img.angle))
      ];

      const uploadedImages = await Promise.all(uploadPromises);
      const categoryName = categories.find(c => c.id === formData.category_id)?.name || '';
      
      fetch('/api/process-product-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          workerId,
          isAccessory,
          categoryName,
          modelCode: formData.model_code,
          variantCode: formData.variant_code,
          uploadedImages 
        }),
        keepalive: true 
      }).catch(err => console.error("Errore avvio AI in background:", err));

      onClose(); 

    } catch (error) {
      console.error("Errore salvataggio:", error);
      alert("Errore durante l'upload. Controlla la connessione e riprova.");
      setIsSaving(false);
    }
  };

  const menCategories = categories.filter(c => c.gender.toLowerCase() === 'uomo');
  const womenCategories = categories.filter(c => c.gender.toLowerCase() === 'donna');
  const unisexCategories = categories.filter(c => c.gender.toLowerCase() === 'unisex');

  const posesToRender = isAccessory ? accessoryPoses : clothingPoses;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full rounded-t-[2rem] min-h-[90vh] flex flex-col shadow-2xl">
        
        <div className="px-6 py-4 flex justify-between items-center border-b border-gray-50">
          <h2 className="text-xl font-black text-black">Completa Prodotto</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-500 active:scale-90 transition-transform">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
          
          {seasons.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-900">Stagione <span className="text-red-500">*</span></h3>
              <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar snap-x">
                {seasons.map((season) => (
                  <button
                    key={season.id}
                    onClick={() => setSelectedSeason(season.id)}
                    className={`flex-shrink-0 snap-start px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                      selectedSeason === season.id
                        ? 'bg-black text-white border-black shadow-md'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {season.collection}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <h3 className="font-bold text-gray-900">Dati Cartellino</h3>
              {isOcrProcessing ? <Loader2 size={16} className="animate-spin text-gray-400" /> : <Check size={16} className="text-black" />}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <input 
                  type="text" value={formData.model_code} 
                  onChange={e => setFormData({...formData, model_code: e.target.value})}
                  className="w-full bg-gray-100 rounded-xl px-4 py-3 text-black font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder={isOcrProcessing ? "Lettura..." : "Modello"} 
                />
              </div>
              <div className="col-span-1">
                <input 
                  type="text" value={formData.variant_code} 
                  onChange={e => setFormData({...formData, variant_code: e.target.value})}
                  className="w-full bg-gray-100 rounded-xl px-4 py-3 text-black font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black" 
                  placeholder={isOcrProcessing ? "Lettura..." : "Variante"}
                />
              </div>
              <div className="col-span-2">
                <input 
                  type="text" value={formData.ean} 
                  onChange={e => setFormData({...formData, ean: e.target.value})}
                  className="w-full bg-gray-100 rounded-xl px-4 py-3 text-black font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black" 
                  placeholder={isOcrProcessing ? "Lettura EAN..." : "Codice a barre"}
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-bold text-gray-900">Categoria <span className="text-red-500">*</span></h3>
            <select 
              value={formData.category_id}
              onChange={e => setFormData({...formData, category_id: e.target.value})}
              className="w-full bg-gray-100 rounded-xl px-4 py-4 text-black font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="" disabled>Seleziona tipologia...</option>
              {womenCategories.length > 0 && (
                <optgroup label="Donna">
                  {womenCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </optgroup>
              )}
              {menCategories.length > 0 && (
                <optgroup label="Uomo">
                  {menCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </optgroup>
              )}
              {unisexCategories.length > 0 && (
                <optgroup label="Accessori / Unisex">
                  {unisexCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {formData.category_id && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-900">Scatta le foto richieste</h3>

              <div className="bg-blue-50 text-blue-800 p-3 rounded-xl flex items-start gap-3 text-sm font-medium mb-4">
                <Info size={20} className="mt-0.5 shrink-0" />
                <p>
                  {isAccessory 
                    ? "Poggia l'oggetto su una superficie pulita. L'AI rimuoverà lo sfondo e aggiungerà ombre realistiche." 
                    : "Stendi il capo per Fronte e Retro (elaborati in Flat Lay). Etichette e dettagli verranno scontornati mantenendo la prospettiva originale."}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {posesToRender.map((pose) => {
                  const capturedImage = productImages.find(img => img.angle === pose.angle);
                  
                  return (
                    <div key={pose.angle} className={`relative aspect-square bg-gray-50 rounded-2xl overflow-hidden flex flex-col group border-2 border-dashed ${pose.required && !capturedImage ? 'border-red-300 bg-red-50/50' : 'border-gray-300'}`}>
                      
                      {!capturedImage && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                          <span className={`text-sm font-bold ${pose.required ? 'text-red-500' : 'text-gray-500'}`}>
                            {pose.label}
                            {pose.required && '*'}
                          </span>
                        </div>
                      )}

                      {capturedImage && (
                        <img src={capturedImage.preview} className="absolute inset-0 w-full h-full object-cover z-10" />
                      )}

                      <input 
                        id={`capture-${pose.angle}`} type="file" accept="image/*" capture="environment" 
                        className="hidden" onChange={(e) => handleProductCapture(e, pose.angle)} 
                      />
                      <label 
                        htmlFor={`capture-${pose.angle}`}
                        className={`absolute inset-0 z-20 flex flex-col justify-end p-3 cursor-pointer ${capturedImage ? 'opacity-0 group-hover:opacity-100 bg-black/40' : 'bg-transparent'} transition-all`}
                      >
                        <div className="bg-black text-white w-full py-2.5 rounded-xl flex justify-center items-center gap-2 backdrop-blur-md shadow-md active:scale-95 transition-transform">
                          <Camera size={18} />
                          <span className="text-sm font-bold">{capturedImage ? 'Rifai' : 'Scatta'}</span>
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-white border-t border-gray-50 shadow-[0_-10px_20px_rgb(0,0,0,0.02)]">
          <button 
            onClick={handleSave}
            disabled={
              isSaving || 
              isOcrProcessing || 
              !formData.category_id || 
              !selectedSeason ||
              (!isAccessory && (!productImages.some(img => img.angle === 'front') || !productImages.some(img => img.angle === 'back'))) ||
              (isAccessory && productImages.length === 0)
            }
            className="w-full py-4 rounded-2xl font-black text-white text-lg transition-all disabled:bg-gray-200 disabled:text-gray-400 bg-black active:scale-95 shadow-lg"
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin" /> Elaborazione...
              </span>
            ) : 'Salva Prodotto'}
          </button>
        </div>

      </div>
    </div>
  );
}