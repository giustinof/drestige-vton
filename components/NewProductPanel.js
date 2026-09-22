"use client"
import { useState, useEffect } from 'react';
import { Camera, X, Loader2, Check, Info } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Aggiusta il percorso

export default function NewProductPanel({ onClose, workerId, categories, initialTagFile }) {
  const [tagImage] = useState(URL.createObjectURL(initialTagFile));
  
  // -- NUOVI STATI PER LA GESTIONE DEL MODELLO --
  const [selectedModelInfo, setSelectedModelInfo] = useState(null); // { id, name }
  const [modelPoses, setModelPoses] = useState([]); // [{ angle, url }]
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  
  // Modificato lo stato productImages per gestire lo scatto guidato (angolo per angolo)
  // Ora sarà un array di oggetti: { file, preview, angle }
  const [productImages, setProductImages] = useState([]); 
  
  const [formData, setFormData] = useState({
    model_code: '',
    variant_code: '',
    ean: '',
    category_id: ''
  });
  
  const [isOcrProcessing, setIsOcrProcessing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 1. OCR Iniziale (Invariato)
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

  // 2. LOGICA SELEZIONE MODELLO (Scatta quando si sceglie la categoria)
  useEffect(() => {
    const fetchModel = async () => {
      if (!formData.category_id) return;
      
      setIsLoadingModel(true);
      setProductImages([]); // Reset delle foto del prodotto se cambi categoria
      setSelectedModelInfo(null);
      setModelPoses([]);

      try {
        // A. Trova il genere della categoria selezionata
        const category = categories.find(c => c.id === formData.category_id);
        if (!category) throw new Error("Categoria non trovata");

        // B. Trova i modelli attivi con quel genere
        // Nota: Assicurati che il 'gender' in ai_models coincida (es. 'donna' o 'Donna')
        const { data: availableModels, error: modelsError } = await supabase
          .from('ai_models')
          .select('id, name')
          .ilike('gender', category.gender) // Usa ilike per case-insensitivity
          .eq('is_active', true);

        if (modelsError) throw modelsError;
        
        if (availableModels.length === 0) {
           console.warn("Nessun modello trovato per questo genere.");
           setIsLoadingModel(false);
           return;
        }

        // C. Scegli un modello a caso
        const randomModel = availableModels[Math.floor(Math.random() * availableModels.length)];
        setSelectedModelInfo(randomModel);

        // D. Prendi le pose previste per QUEL modello e QUELLA categoria
        const { data: poses, error: posesError } = await supabase
          .from('ai_poses')
          .select('angle, base_image_url')
          .eq('model_id', randomModel.id)
          .eq('category_id', formData.category_id);

        if (posesError) throw posesError;
        
        // Ordiniamo le pose (frontale per prima) per coerenza visiva
        const order = { 'front': 1, 'back': 2, 'left': 3, 'right': 4 };
        const sortedPoses = poses.sort((a, b) => (order[a.angle] || 5) - (order[b.angle] || 5));
        
        setModelPoses(sortedPoses);

      } catch (error) {
        console.error("Errore recupero modello:", error);
      } finally {
        setIsLoadingModel(false);
      }
    };

    fetchModel();
  }, [formData.category_id, categories]);


  // 3. Acquisizione guidata (passiamo l'angolo)
  const handleProductCapture = (e, angle) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Aggiorna se esiste già una foto per quell'angolo, altrimenti aggiunge
    setProductImages(prev => {
      const existing = prev.filter(p => p.angle !== angle);
      return [...existing, { file, preview: URL.createObjectURL(file), angle }];
    });
    
    e.target.value = null; 
  };

  // 4. Salvataggio (Aggiornato per supportare i metadati 'angle')
  const handleSave = async () => {
    if (!formData.category_id) return alert("Devi selezionare una categoria.");
    // Verifica che l'utente abbia scattato almeno la foto 'front' (opzionale, ma consigliato)
    const hasFront = productImages.some(img => img.angle === 'front');
    if (!hasFront && modelPoses.length > 0) return alert("Devi scattare almeno la foto frontale del capo.");
    if (productImages.length === 0) return alert("Aggiungi almeno una foto del prodotto.");

    setIsSaving(true);
    try {
      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert([{
          worker_id: workerId,
          category_id: formData.category_id,
          model_code: formData.model_code,
          variant_code: formData.variant_code,
          ean: formData.ean,
          status: 'processing',
          // Opzionale: puoi salvare quale modello è stato assegnato, se hai aggiunto la colonna
          // assigned_model_id: selectedModelInfo?.id 
        }]).select().single();

      if (productError) throw productError;
      const productId = newProduct.id;

      const uploadImageToStorage = async (file, type, angle = 'none') => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${productId}_${type}_${angle}_${Date.now()}.${fileExt}`;
        const filePath = `${productId}/${fileName}`;
        
        const { error } = await supabase.storage.from('product-images').upload(filePath, file);
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
        return publicUrl;
      };

      const tagUrl = await uploadImageToStorage(initialTagFile, 'tag');
      
      // Carica mantenendo traccia dell'angolo
      const productUploadPromises = productImages.map(img => uploadImageToStorage(img.file, 'raw_item', img.angle));
      const productUrls = await Promise.all(productUploadPromises);

      const imageRecords = [
        { product_id: productId, url: tagUrl, type: 'tag' },
        // Modifica la tabella product-images per aggiungere la colonna 'angle' se vuoi tracciarlo a DB
        ...productUrls.map((url, index) => ({ product_id: productId, url, type: 'raw_item' /* , angle: productImages[index].angle */ }))
      ];

      const { error: imagesError } = await supabase.from('product_images').insert(imageRecords);
      if (imagesError) throw imagesError;

      onClose();

      productImages.forEach(async (capturedImage, index) => {
      try {
        const poseInfo = modelPoses.find(p => p.angle === capturedImage.angle);
        const garmentUrl = productUrls[index];

        if (poseInfo && garmentUrl) {
          await fetch('/api/generate-genlook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: productId,
              modelImageUrl: poseInfo.base_image_url,
              garmentImageUrl: garmentUrl,
              angle: capturedImage.angle,
              workerId: workerId // per popolare externalUserId
            })
          });
        }
      } catch (err) {
        console.error(`Errore Genlook angolo ${capturedImage.angle}:`, err);
      }
    });

    } catch (error) {
      console.error("Errore salvataggio:", error);
      alert("Errore durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  const menCategories = categories.filter(c => c.gender.toLowerCase() === 'uomo');
  const womenCategories = categories.filter(c => c.gender.toLowerCase() === 'donna');
  const unisexCategories = categories.filter(c => c.gender.toLowerCase() === 'unisex');

  // Traduzione per la UI
  const angleLabels = { 'front': 'Fronte', 'back': 'Retro', 'left': 'Lato SX', 'right': 'Lato DX' };

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
          
          {/* Sezione Dati */}
          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <h3 className="font-bold text-gray-900">Dati Cartellino</h3>
              {isOcrProcessing ? <Loader2 size={16} className="animate-spin text-gray-400" /> : <Check size={16} className="text-black" />}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <input 
                  type="text" 
                  value={formData.model_code} 
                  onChange={e => setFormData({...formData, model_code: e.target.value})}
                  className="w-full bg-gray-100 rounded-xl px-4 py-3 text-black font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder={isOcrProcessing ? "Lettura..." : "Modello"} 
                />
              </div>
              <div className="col-span-1">
                <input 
                  type="text" 
                  value={formData.variant_code} 
                  onChange={e => setFormData({...formData, variant_code: e.target.value})}
                  className="w-full bg-gray-100 rounded-xl px-4 py-3 text-black font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black" 
                  placeholder={isOcrProcessing ? "Lettura..." : "Variante"}
                />
              </div>
              <div className="col-span-2">
                <input 
                  type="text" 
                  value={formData.ean} 
                  onChange={e => setFormData({...formData, ean: e.target.value})}
                  className="w-full bg-gray-100 rounded-xl px-4 py-3 text-black font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black" 
                  placeholder={isOcrProcessing ? "Lettura EAN..." : "Codice a barre"}
                />
              </div>
            </div>
          </div>
          
          {/* Sezione Categoria */}
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

          {/* SEZIONE MODELLO E SCATTO FOTO (Dinamicizzata) */}
          {formData.category_id && (
            <div className="space-y-4">
              <div className="flex justify-between items-end mb-2">
                <h3 className="font-bold text-gray-900">Scatta le foto richieste</h3>
                {isLoadingModel && <Loader2 size={16} className="animate-spin text-gray-400" />}
              </div>

              {selectedModelInfo && (
                <div className="bg-blue-50 text-blue-800 p-3 rounded-xl flex items-start gap-3 text-sm font-medium">
                  <Info size={20} className="mt-0.5 shrink-0" />
                  <p>Replica le pose del modello (<strong>{selectedModelInfo.name}</strong>) per un risultato perfetto.</p>
                </div>
              )}

              {/* Layout Dinamico basato sulle pose richieste */}
              <div className="grid grid-cols-2 gap-4">
                {modelPoses.map((pose) => {
                  const capturedImage = productImages.find(img => img.angle === pose.angle);
                  const label = angleLabels[pose.angle] || pose.angle;

                  return (
                    <div key={pose.angle} className="relative aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden shadow-inner flex flex-col group">
                      
                      {/* Immagine di base (Ghost) */}
                      {!capturedImage && (
                        <>
                          <img src={pose.base_image_url} alt={pose.angle} className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-multiply" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-black mb-2 shadow-sm uppercase tracking-wide">
                              {label}
                            </span>
                          </div>
                        </>
                      )}

                      {/* Immagine Scattata */}
                      {capturedImage && (
                        <img src={capturedImage.preview} alt="Catturata" className="absolute inset-0 w-full h-full object-cover z-10" />
                      )}

                      {/* Input Nascosto */}
                      <input 
                        id={`capture-${pose.angle}`}
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        onChange={(e) => handleProductCapture(e, pose.angle)} 
                      />
                      
                      {/* Overlay Clickable per scattare/rifare */}
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
              
              {/* Fallback se la categoria non ha pose mappate */}
              {!isLoadingModel && modelPoses.length === 0 && (
                <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-2xl text-center text-gray-500 text-sm font-medium">
                  Nessun modello specifico configurato per questa categoria. Mappalo nel database.
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-white border-t border-gray-50 shadow-[0_-10px_20px_rgb(0,0,0,0.02)]">
          <button 
            onClick={handleSave}
            disabled={isSaving || isOcrProcessing || (!formData.category_id)}
            className={`w-full py-4 rounded-2xl font-black text-white text-lg transition-all ${
              isSaving || isOcrProcessing || (!formData.category_id) ? 'bg-gray-200 text-gray-400' : 'bg-black active:scale-95 shadow-lg'
            }`}
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