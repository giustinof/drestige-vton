"use client"
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PackageOpen, Sparkles, X, Edit, Trash2, CalendarDays, Loader2, Save, CheckSquare, Check, Download, AlertTriangle, EyeOff, Clock, Share2, RefreshCw, CheckCheck, ChevronLeft, ChevronRight, Crop } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import PullToRefresh from 'react-simple-pull-to-refresh';
import Cropper from 'react-easy-crop';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// --- HELPER FUNCTION PER GENERARE L'IMMAGINE RITAGLIATA / CENTRATA ---
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(imageSrc, pixelCrop, bgColor = '#ffffff') {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Riempie lo sfondo di bianco (fondamentale per le foto ricentrate)
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Disegna l'immagine tenendo conto dello spostamento. 
  // Se l'utente ha fatto zoom-out (spazio bianco), pixelCrop avrà coordinate negative.
  ctx.drawImage(
    image,
    -pixelCrop.x,
    -pixelCrop.y,
    image.width,
    image.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
  });
}

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 max-w-3xl mx-auto">
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div key={i} className="bg-white rounded-[1.25rem] p-2 shadow-sm border border-zinc-100 animate-pulse">
        <div className="aspect-[3/4] rounded-xl bg-zinc-200/60 mb-3"></div>
        <div className="px-2 pb-1 space-y-2">
          <div className="h-3 bg-zinc-200 rounded w-3/4"></div>
          <div className="h-2 bg-zinc-200 rounded w-1/2"></div>
        </div>
      </div>
    ))}
  </div>
);

export default function InventoryView({ viewMode, workerId, refreshKey, searchQuery, activeFilter, scannedEan, setScannedEan }) {
  const [products, setProducts] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, product: null });
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ model_code: '', variant_code: '', ean: '', collection_id: '', title: '', description: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [deleteModal, setDeleteModal] = useState(null); 
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [isSharing, setIsSharing] = useState(false); 
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReparsing, setIsReparsing] = useState(false);
  const [isBulkReparsing, setIsBulkReparsing] = useState(false);

  // Stati per Editor Immagine (Crop/Center)
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isSavingImage, setIsSavingImage] = useState(false);

  const touchTimeout = useRef(null);
  const isLongPress = useRef(false);
  const imgTouchTimeout = useRef(null);
  const isImgLongPress = useRef(false);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [modalTouchStartPos, setModalTouchStartPos] = useState(null);

  const fetchData = async () => {
    const { data: seasonsData } = await supabase.from('collections').select('*').order('created_at', { ascending: false });
    if (seasonsData) setSeasons(seasonsData);

    let query = supabase.from('products').select(`*, product_images(id, url, type, enabled), collections(*)`).order('created_at', { ascending: false });
    if (viewMode === 'my-products') query = query.eq('worker_id', workerId);

    const { data, error } = await query;
    if (!error && data) {
      setProducts(data);
      const params = new URLSearchParams(window.location.search);
      const sharedProductId = params.get('product');
      if (sharedProductId) {
        const sharedProduct = data.find(p => p.id === sharedProductId);
        if (sharedProduct) {
          window.history.pushState({ modal: 'product' }, '');
          setSelectedProduct(sharedProduct);
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  };

  useEffect(() => { setLoading(true); fetchData().then(() => setLoading(false)); }, [viewMode, workerId, refreshKey]);

  useEffect(() => {
    if (scannedEan && products.length > 0) {
      const foundProduct = products.find(p => p.ean === scannedEan || p.model_code === scannedEan);
      if (foundProduct) { window.history.pushState({ modal: 'product' }, ''); setSelectedProduct(foundProduct); } 
      else alert("Nessun prodotto trovato con EAN: " + scannedEan);
      setScannedEan('');
    }
  }, [scannedEan, products, setScannedEan]);

  useEffect(() => { if (isSelectionMode && selectedItemIds.length === 0) setIsSelectionMode(false); }, [selectedItemIds, isSelectionMode]);

  useEffect(() => {
    const handlePopState = (e) => {
      const state = e.state?.modal;
      if (state === 'product') { setFullscreenImage(null); setEditingProduct(null); setDeleteModal(null); setIsEditingImage(false); }
      else if (state === 'edit') { setFullscreenImage(null); setSelectedProduct(null); setDeleteModal(null); setIsEditingImage(false); }
      else if (state === 'delete') { setDeleteModal(null); }
      else { setFullscreenImage(null); setSelectedProduct(null); setEditingProduct(null); setDeleteModal(null); setIsEditingImage(false); }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleProductClick = (product) => { if (isLongPress.current) return; window.history.pushState({ modal: 'product' }, ''); setSelectedProduct(product); };
  const closeProductModal = () => { if (window.history.state?.modal === 'product') window.history.back(); else setSelectedProduct(null); };
  const openFullscreenImage = (img) => { window.history.pushState({ modal: 'photo' }, ''); setFullscreenImage(img); setIsEditingImage(false); setZoom(1); };
  const closeFullscreenImage = () => { if (window.history.state?.modal === 'photo') window.history.back(); else { setFullscreenImage(null); setIsEditingImage(false); } };
  const openEditModal = (product) => { window.history.pushState({ modal: 'edit' }, ''); setEditForm({ model_code: product.model_code || '', variant_code: product.variant_code || '', ean: product.ean || '', collection_id: product.collection_id || '', title: product.title || '', description: product.description || '' }); setEditingProduct(product); };
  const closeEditModal = () => { if (window.history.state?.modal === 'edit') window.history.back(); else setEditingProduct(null); };
  const openDeleteModal = (type, product = null) => { window.history.pushState({ modal: 'delete' }, ''); setDeleteModal({ type, product }); };
  const closeDeleteModal = () => { if (window.history.state?.modal === 'delete') window.history.back(); else setDeleteModal(null); };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu({ visible: false, x: 0, y: 0, product: null });
    if (contextMenu.visible) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  const toggleSelection = (productId) => { setSelectedItemIds(prev => prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]); if (window.navigator?.vibrate) window.navigator.vibrate(50); };
  
  const handleContextMenuTrigger = (x, y, product) => {
    if (isSelectionMode) toggleSelection(product.id);
    else {
      const menuWidth = 180; const menuHeight = 150; 
      const safeX = x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 16 : x;
      const safeY = y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 16 : y;
      if (window.navigator?.vibrate) window.navigator.vibrate(100);
      setContextMenu({ visible: true, x: safeX, y: safeY, product });
    }
  };
  const handleTouchStart = (e, product) => { isLongPress.current = false; touchTimeout.current = setTimeout(() => { isLongPress.current = true; handleContextMenuTrigger(e.touches[0].clientX, e.touches[0].clientY, product); }, 500); };
  const handleTouchEnd = () => { if (touchTimeout.current) clearTimeout(touchTimeout.current); };
  const handleTouchMove = () => { if (touchTimeout.current) clearTimeout(touchTimeout.current); };
  const handleRightClick = (e, product) => { e.preventDefault(); handleContextMenuTrigger(e.clientX, e.clientY, product); };

  const toggleImageEnabled = async (img) => {
    const newStatus = !img.enabled;
    if (window.navigator?.vibrate) window.navigator.vibrate(50);
    setSelectedProduct(prev => ({ ...prev, product_images: prev.product_images.map(i => i.id === img.id ? { ...i, enabled: newStatus } : i) }));
    setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, product_images: p.product_images.map(i => i.id === img.id ? { ...i, enabled: newStatus } : i) } : p));
    await supabase.from('product_images').update({ enabled: newStatus }).eq('id', img.id);
  };
  const handleImgTouchStart = (e, img) => { isImgLongPress.current = false; imgTouchTimeout.current = setTimeout(() => { isImgLongPress.current = true; toggleImageEnabled(img); }, 500); };
  const handleImgTouchEnd = () => { if (imgTouchTimeout.current) clearTimeout(imgTouchTimeout.current); };
  const handleImgClick = (img) => { if (isImgLongPress.current) return; openFullscreenImage(img); };

  const displayedProducts = products.filter(p => {
    if (searchQuery && !p.model_code?.toLowerCase().includes(searchQuery.toLowerCase()) && !p.ean?.includes(searchQuery)) return false;
    if (activeFilter === 'downloaded') return p.status === 'downloaded';
    
    if (p.status === 'downloaded') return false;
    const processed = p.product_images?.filter(img => img.type === 'processed').length || 0;
    const raws = p.product_images?.filter(img => img.type !== 'processed').length || 0;
    
    if (activeFilter === 'processing' && (p.status !== 'processing' || processed > 0)) return false;
    if (activeFilter === 'done' && processed === 0) return false;
    if (activeFilter === 'no-photo' && processed === 0 && raws === 0) return false;
    
    return true;
  });

  const handleSelectAll = () => {
    if (selectedItemIds.length === displayedProducts.length && displayedProducts.length > 0) {
      setSelectedItemIds([]);
      setIsSelectionMode(false);
    } else {
      setSelectedItemIds(displayedProducts.map(p => p.id));
    }
  };

  const handleReparseTag = async () => {
    if (!fullscreenImage || !selectedProduct) return;
    setIsReparsing(true);
    try {
      const response = await fetch(fullscreenImage.url);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('image', blob, 'tag_image.jpg');
      
      const apiResponse = await fetch('/api/parse-tag', { method: 'POST', body: formData });
      if (!apiResponse.ok) throw new Error('Errore durante il parse');
      
      const parsedData = await apiResponse.json();
      
      if (parsedData.model_code) {
        const { error } = await supabase.from('products').update({
          model_code: parsedData.model_code,
          variant_code: parsedData.variant_code || '',
          ean: parsedData.ean || ''
        }).eq('id', selectedProduct.id);

        if (!error) {
          const updatedProduct = { ...selectedProduct, model_code: parsedData.model_code, variant_code: parsedData.variant_code || '', ean: parsedData.ean || '' };
          setSelectedProduct(updatedProduct);
          setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
          alert(`✅ Dati etichetta corretti!\n\nModello: ${parsedData.model_code}\nVariante: ${parsedData.variant_code}\nEAN: ${parsedData.ean}`);
        } else alert('Errore durante il salvataggio sul database.');
      } else alert('Nessun dato valido rilevato dall\'Intelligenza Artificiale.');
    } catch (err) {
      console.error(err);
      alert('Errore di comunicazione con il server AI.');
    } finally {
      setIsReparsing(false);
    }
  };

  const handleBulkReparse = async () => {
    if (selectedItemIds.length === 0) return;
    setIsBulkReparsing(true);

    let successCount = 0;
    let failCount = 0;

    for (const productId of selectedItemIds) {
      const product = products.find(p => p.id === productId);
      if (!product) continue;

      const rawImage = product.product_images?.find(img => img.type !== 'processed');
      if (!rawImage) { failCount++; continue; }

      try {
        const response = await fetch(rawImage.url);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('image', blob, 'tag_image.jpg');
        
        const apiResponse = await fetch('/api/parse-tag', { method: 'POST', body: formData });
        if (!apiResponse.ok) throw new Error('Errore API');
        
        const parsedData = await apiResponse.json();
        
        if (parsedData.model_code) {
          const { error } = await supabase.from('products').update({
            model_code: parsedData.model_code,
            variant_code: parsedData.variant_code || '',
            ean: parsedData.ean || ''
          }).eq('id', product.id);

          if (!error) {
            setProducts(prev => prev.map(p => p.id === product.id ? { 
              ...p, 
              model_code: parsedData.model_code, 
              variant_code: parsedData.variant_code || '', 
              ean: parsedData.ean || '' 
            } : p));
            successCount++;
          } else failCount++;
        } else failCount++;
      } catch (err) { failCount++; }
    }

    setIsBulkReparsing(false);
    alert(`Rielaborazione Completata!\n\n✅ Successi: ${successCount}\n❌ Falliti: ${failCount}`);
    setSelectedItemIds([]);
    setIsSelectionMode(false);
  };

  const handleSaveEditedImage = async () => {
    setIsSavingImage(true);
    try {
      const blob = await getCroppedImg(fullscreenImage.url, croppedAreaPixels, '#ffffff');

      // Ricava il path originale se esiste
      const oldUrlParts = fullscreenImage.url.split('/product-images/');
      const oldPath = oldUrlParts.length > 1 ? oldUrlParts[1] : null;

      // Genera nuovo nome univoco
      const newFileName = `${Date.now()}_edited.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(newFileName, blob, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(newFileName);

      // Aggiorna database
      const { error: dbError } = await supabase
        .from('product_images')
        .update({ url: publicUrl })
        .eq('id', fullscreenImage.id);

      if (dbError) throw dbError;

      // Opzionale: Elimina vecchia foto dallo storage
      if (oldPath) {
        await supabase.storage.from('product-images').remove([oldPath]);
      }

      // Aggiorna lo stato UI locale
      const updatedImg = { ...fullscreenImage, url: publicUrl };
      setFullscreenImage(updatedImg);

      setProducts(prev => prev.map(p => {
        if (p.id === selectedProduct.id) {
          return {
            ...p,
            product_images: p.product_images.map(i => i.id === updatedImg.id ? updatedImg : i)
          };
        }
        return p;
      }));

      setSelectedProduct(prev => ({
        ...prev,
        product_images: prev.product_images.map(i => i.id === updatedImg.id ? updatedImg : i)
      }));

      setIsEditingImage(false);
    } catch (e) {
      console.error(e);
      alert("Si è verificato un errore durante il salvataggio dell'immagine modificata.");
    } finally {
      setIsSavingImage(false);
    }
  };

  const handleShareProduct = async () => {
    if (!navigator.share) return alert("Browser non supporta la condivisione rapida.");
    setIsSharing(true);
    const productUrl = `${window.location.origin}${window.location.pathname}?product=${selectedProduct.id}`;
    const coverImageUrl = selectedProduct.product_images?.find(i => i.type === 'processed')?.url || selectedProduct.product_images?.find(i => i.type === 'raw_item')?.url;
    let shareData = { title: `Prodotto ${selectedProduct.model_code}`, text: `Dettagli: ${selectedProduct.model_code} (Var: ${selectedProduct.variant_code})\n\nApri: ${productUrl}` };
    if (coverImageUrl) {
      try {
        const response = await fetch(coverImageUrl);
        const blob = await response.blob();
        const file = new File([blob], `${selectedProduct.model_code}.jpg`, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) shareData.files = [file];
      } catch (error) {}
    }
    try { await navigator.share(shareData); } catch (err) {} finally { setIsSharing(false); }
  };

  const handleBulkDownload = async () => {
    if (selectedItemIds.length === 0) return;
    setIsDownloading(true);

    try {
      const zip = new JSZip();
      const downloadedProductIds = [];
      const downloadedImageIds = [];

      for (const productId of selectedItemIds) {
        const product = products.find(p => p.id === productId);
        if (!product) continue;

        const validImages = product.product_images?.filter(img => img.type === 'processed' && img.enabled !== false) || [];
        if (validImages.length === 0) continue; 

        const seasonName = product.collections?.collection || 'SenzaStagione';
        const folder = zip.folder(seasonName);

        const safeModel = (product.model_code || 'MOD').replace(/[^a-zA-Z0-9_-]/g, '');
        const safeVariant = (product.variant_code || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const baseFileName = `${safeModel}${safeVariant}`;

        for (let i = 0; i < validImages.length; i++) {
          const img = validImages[i];
          const fileName = i === 0 ? `${baseFileName}.jpg` : `${baseFileName}_${i}.jpg`;
          
          const response = await fetch(img.url);
          const blob = await response.blob();
          
          folder.file(fileName, blob);
          downloadedImageIds.push(img.id);
        }
        
        downloadedProductIds.push(product.id);
      }

      if (downloadedProductIds.length === 0) {
        alert("Nessuna foto AI abilitata da scaricare nei prodotti selezionati.");
        setIsDownloading(false);
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Export_Drestige_${new Date().toISOString().split('T')[0]}.zip`);

      await supabase.from('products').update({ status: 'downloaded' }).in('id', downloadedProductIds);
      await supabase.from('downloads').insert({ worker_id: workerId, product_images: downloadedImageIds });

      setProducts(prev => prev.map(p => downloadedProductIds.includes(p.id) ? { ...p, status: 'downloaded' } : p));
      setSelectedItemIds([]);
      setIsSelectionMode(false);

    } catch (err) {
      console.error(err);
      alert("Si è verificato un errore durante la creazione dello ZIP.");
    } finally {
      setIsDownloading(false);
    }
  };

  const confirmDeleteAction = async () => {
    setIsDeleting(true);
    if (deleteModal.type === 'single') {
      const { product } = deleteModal;
      const pathsToDelete = product.product_images?.map(img => { try { const urlParts = img.url.split('/product-images/'); return urlParts.length > 1 ? urlParts[1] : null; } catch (e) { return null; } }).filter(Boolean) || [];
      if (pathsToDelete.length > 0) await supabase.storage.from('product-images').remove(pathsToDelete);
      const { error: dbError } = await supabase.from('products').delete().eq('id', product.id);
      if (!dbError) setProducts(prev => prev.filter(p => p.id !== product.id)); else alert("Errore");
    } else if (deleteModal.type === 'bulk') {
      const productsToDelete = products.filter(p => selectedItemIds.includes(p.id));
      let pathsToDelete = [];
      productsToDelete.forEach(product => { product.product_images?.forEach(img => { try { const urlParts = img.url.split('/product-images/'); if (urlParts.length > 1) pathsToDelete.push(urlParts[1]); } catch (e) {} }); });
      if (pathsToDelete.length > 0) await supabase.storage.from('product-images').remove(pathsToDelete);
      const { error: dbError } = await supabase.from('products').delete().in('id', selectedItemIds);
      if (!dbError) { setProducts(prev => prev.filter(p => !selectedItemIds.includes(p.id))); setIsSelectionMode(false); setSelectedItemIds([]); } else alert("Errore");
    }
    setIsDeleting(false);
    closeDeleteModal();
  };

  const handleSaveEdit = async () => {
    setIsUpdating(true);
    const { error } = await supabase.from('products').update({ model_code: editForm.model_code, variant_code: editForm.variant_code, ean: editForm.ean, collection_id: editForm.collection_id, title: editForm.title, description: editForm.description }).eq('id', editingProduct.id);
    setIsUpdating(false);
    if (!error) { setProducts(prev => prev.map(p => { if (p.id === editingProduct.id) { const updatedCollection = seasons.find(s => s.id === editForm.collection_id) || p.collections; return { ...p, ...editForm, collections: updatedCollection }; } return p; })); closeEditModal(); } else alert("Errore");
  };

  // --- LOGICA SWIPE MODALE PRODOTTI AVANZATA ---
  const onModalTouchStart = (e) => {
    if (e.target.closest('.overflow-x-auto') || e.target.closest('button')) return;
    setModalTouchStartPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    setIsDragging(true);
  };

  const onModalTouchMove = (e) => {
    if (!modalTouchStartPos || !isDragging) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - modalTouchStartPos.x;
    const diffY = currentY - modalTouchStartPos.y;

    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 15) {
      setIsDragging(false);
      setSwipeOffset(0);
      return;
    }
    setSwipeOffset(diffX);
  };

  const onModalTouchEnd = (e) => {
    if (!modalTouchStartPos || !selectedProduct) {
      setIsDragging(false);
      setSwipeOffset(0);
      return;
    }
    
    setIsDragging(false);
    const currentX = e.changedTouches[0].clientX;
    const diffX = currentX - modalTouchStartPos.x;
    const threshold = 80;
    const currentIndex = displayedProducts.findIndex(p => p.id === selectedProduct.id);

    if (diffX < -threshold && currentIndex < displayedProducts.length - 1) {
      setSwipeOffset(-window.innerWidth);
      setTimeout(() => {
        setIsDragging(true); 
        setSwipeOffset(window.innerWidth); 
        setSelectedProduct(displayedProducts[currentIndex + 1]);
        setTimeout(() => { setIsDragging(false); setSwipeOffset(0); }, 50);
      }, 300);
    } else if (diffX > threshold && currentIndex > 0) {
      setSwipeOffset(window.innerWidth);
      setTimeout(() => {
        setIsDragging(true);
        setSwipeOffset(-window.innerWidth);
        setSelectedProduct(displayedProducts[currentIndex - 1]);
        setTimeout(() => { setIsDragging(false); setSwipeOffset(0); }, 50);
      }, 300);
    } else {
      setSwipeOffset(0);
    }
    setModalTouchStartPos(null);
  };

  const navigateImage = (direction, e) => {
    e.stopPropagation();
    if (!selectedProduct || !fullscreenImage) return;
    
    const processedImages = selectedProduct.product_images?.filter(img => img.type === 'processed') || [];
    const rawImages = selectedProduct.product_images?.filter(img => img.type !== 'processed') || [];
    const allImages = [...processedImages, ...rawImages];
    
    if (allImages.length <= 1) return;

    const currentIndex = allImages.findIndex(img => img.id === fullscreenImage.id);
    if (currentIndex === -1) return;
    
    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % allImages.length;
      setFullscreenImage(allImages[nextIndex]);
    } else {
      const prevIndex = (currentIndex - 1 + allImages.length) % allImages.length;
      setFullscreenImage(allImages[prevIndex]);
    }
  };

  if (loading) return <SkeletonGrid />;

  return (
    <>
      {isSelectionMode && (
        <div className="fixed top-0 left-0 right-0 z-50 h-[72px] bg-indigo-600 text-white px-4 flex items-center justify-between shadow-lg animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center gap-3">
            <button onClick={() => { setIsSelectionMode(false); setSelectedItemIds([]); }} className="p-2 -ml-2 rounded-full hover:bg-indigo-500/50 active:scale-95 transition-all text-white"><X size={24} strokeWidth={2.5} /></button>
            <span className="font-bold text-[19px] tracking-tight">{selectedItemIds.length} selezionati</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleSelectAll} 
              className="p-2.5 rounded-full hover:bg-indigo-500/50 active:scale-95 transition-all text-white" 
              title="Seleziona Tutti"
            >
              <CheckCheck size={22} strokeWidth={2} />
            </button>
            <button 
              onClick={handleBulkReparse} 
              disabled={isBulkReparsing || isDownloading}
              className="p-2.5 rounded-full hover:bg-indigo-500/50 active:scale-95 transition-all text-white disabled:opacity-50" 
              title="Rielabora Etichette AI"
            >
              {isBulkReparsing ? <Loader2 size={22} className="animate-spin" /> : <RefreshCw size={22} strokeWidth={2} />}
            </button>
            <button 
              onClick={handleBulkDownload} 
              disabled={isDownloading || isBulkReparsing}
              className="p-2.5 rounded-full hover:bg-indigo-500/50 active:scale-95 transition-all text-white disabled:opacity-50" 
              title="Scarica foto"
            >
              {isDownloading ? <Loader2 size={22} className="animate-spin" /> : <Download size={22} strokeWidth={2} />}
            </button>
            <button onClick={() => openDeleteModal('bulk')} disabled={isDownloading || isBulkReparsing} className="p-2.5 rounded-full hover:bg-indigo-500/50 text-indigo-100 hover:text-white active:scale-95 transition-all disabled:opacity-50" title="Elimina"><Trash2 size={22} strokeWidth={2} /></button>
          </div>
        </div>
      )}

      <PullToRefresh onRefresh={async () => await fetchData()} pullingContent={''} refreshingContent={<div className="flex justify-center p-4"><Loader2 className="animate-spin text-zinc-400" /></div>}>
        <div className="p-4 max-w-3xl mx-auto min-h-[70vh] relative">
          
          <div className="mb-4 px-1 flex items-center justify-between animate-in fade-in">
             <p className="text-sm font-semibold text-zinc-500">
               {displayedProducts.length} {displayedProducts.length === 1 ? 'prodotto' : 'prodotti'} {activeFilter === 'downloaded' ? 'in archivio' : 'trovati'}
             </p>
          </div>

          {displayedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 opacity-70">
              <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-4"><PackageOpen size={36} className="text-zinc-400" strokeWidth={1.5} /></div>
              <p className="font-semibold text-zinc-900 text-lg">Nessun prodotto trovato</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {displayedProducts.map(product => {
                const processedImages = product.product_images?.filter(img => img.type === 'processed') || [];
                const rawImages = product.product_images?.filter(img => img.type === 'raw_item') || [];
                const coverImage = processedImages.length > 0 ? processedImages[0].url : (rawImages.length > 0 ? rawImages[0].url : null);
                const isSelected = selectedItemIds.includes(product.id);
                
                return (
                  <div key={product.id} className={`bg-white rounded-[1.25rem] p-2 shadow-sm border cursor-pointer active:scale-[0.98] transition-all select-none relative ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-2' : 'border-zinc-100 hover:border-zinc-200'}`}
                    onClick={() => handleProductClick(product)} onContextMenu={(e) => handleRightClick(e, product)} onTouchStart={(e) => handleTouchStart(e, product)} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove} onTouchCancel={handleTouchEnd}>
                    {isSelected && (<div className="absolute top-4 right-4 bg-indigo-600 text-white rounded-full p-1 z-1 shadow-md animate-in zoom-in-75"><Check size={16} strokeWidth={3} /></div>)}
                    <div className="aspect-[3/4] rounded-xl bg-zinc-100 mb-3 overflow-hidden relative border border-zinc-50">
                      {coverImage ? (<img src={coverImage} alt={product.model_code} className={`w-full h-full object-cover pointer-events-none transition-opacity ${isSelected ? 'opacity-80' : ''}`} />) : (<div className="w-full h-full flex flex-col items-center justify-center text-zinc-300"><PackageOpen size={24} /></div>)}
                      {product.status === 'processing' && processedImages.length === 0 && (
                          <div className="absolute inset-0 bg-zinc-900/20 backdrop-blur-[2px] flex items-center justify-center"><span className="flex items-center gap-1.5 text-indigo-50 text-xs font-bold px-3 py-1.5 bg-indigo-600/90 rounded-full shadow-lg shadow-indigo-900/20"><Sparkles size={12} className="animate-pulse" /> AI</span></div>
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
      </PullToRefresh>

      {/* MENU CONTESTUALE E MODALI */}
      {contextMenu.visible && (
        <div className="fixed z-50 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-100 p-1.5 flex flex-col min-w-[160px] animate-in fade-in zoom-in-95 duration-150" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors text-left" onClick={() => { setIsSelectionMode(true); setSelectedItemIds([contextMenu.product.id]); setContextMenu({ visible: false, x: 0, y: 0, product: null }); }}><CheckSquare size={16} /> Seleziona</button>
          <div className="h-px bg-zinc-200/50 my-1 mx-2"></div>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 rounded-xl transition-colors text-left" onClick={() => { openEditModal(contextMenu.product); setContextMenu({ visible: false, x: 0, y: 0, product: null }); }}><Edit size={16} /> Modifica</button>
          <div className="h-px bg-zinc-200/50 my-1 mx-2"></div>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left" onClick={() => { openDeleteModal('single', contextMenu.product); setContextMenu({ visible: false, x: 0, y: 0, product: null }); }}><Trash2 size={16} /> Elimina</button>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 z-[70] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-red-100"><AlertTriangle size={32} strokeWidth={2.5} /></div>
            <h3 className="text-xl font-black text-zinc-900 mb-2">Sei sicuro?</h3>
            <p className="text-sm text-zinc-600 font-medium mb-8 leading-relaxed">
              {deleteModal.type === 'single' ? `Stai per eliminare DEFINITIVAMENTE il prodotto "${deleteModal.product.model_code}". Verranno cancellate per sempre anche tutte le foto collegate.` : `Stai per eliminare DEFINITIVAMENTE i ${selectedItemIds.length} prodotti selezionati. Verranno rimosse anche tutte le foto. L'azione è irreversibile.`}
            </p>
            <div className="flex gap-3">
              <button onClick={closeDeleteModal} disabled={isDeleting} className="flex-1 bg-zinc-100 text-zinc-800 font-bold py-3.5 rounded-xl hover:bg-zinc-200 active:scale-95 transition-all disabled:opacity-50">Annulla</button>
              <button onClick={confirmDeleteAction} disabled={isDeleting} className="flex-1 bg-red-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-red-600/30 disabled:opacity-50">
                {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} {isDeleting ? 'Eliminazione...' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={closeEditModal} className="absolute top-4 right-4 p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors"><X size={18} strokeWidth={2.5} /></button>
            <h3 className="text-xl font-black text-zinc-900 mb-6">Modifica Prodotto</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Modello</label><input type="text" value={editForm.model_code} onChange={e => setEditForm({...editForm, model_code: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Variante</label><input type="text" value={editForm.variant_code} onChange={e => setEditForm({...editForm, variant_code: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Codice a Barre (EAN)</label><input type="text" value={editForm.ean} onChange={e => setEditForm({...editForm, ean: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Stagione</label>
                <select value={editForm.collection_id} onChange={e => setEditForm({...editForm, collection_id: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none appearance-none"><option value="" disabled>Nessuna stagione</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.collection}</option>)}</select>
              </div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Titolo SEO</label><input type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Descrizione Prodotto</label><textarea rows={4} value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none resize-none" /></div>
            </div>
            <button onClick={handleSaveEdit} disabled={isUpdating} className="w-full mt-8 bg-zinc-900 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-50">{isUpdating ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}{isUpdating ? 'Salvataggio...' : 'Salva Modifiche'}</button>
          </div>
        </div>
      )}

      {selectedProduct && !editingProduct && (
        <div className="fixed inset-0 z-40 bg-zinc-900/30 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
          <div 
            className={`w-full h-full bg-zinc-50 flex flex-col shadow-2xl ${isDragging ? '' : 'transition-transform duration-300 ease-out'}`}
            style={{ transform: `translateX(${swipeOffset}px)` }}
            onTouchStart={onModalTouchStart}
            onTouchMove={onModalTouchMove}
            onTouchEnd={onModalTouchEnd}
          >
              <header className="px-6 py-4 border-b border-zinc-200/50 flex justify-between items-start bg-white/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
                  <div className="pr-2">
                      <h2 className="text-2xl font-black text-zinc-900 leading-tight">{selectedProduct.model_code}</h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
                        <p className="text-sm text-zinc-600 font-semibold bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">Var: {selectedProduct.variant_code}</p>
                        {selectedProduct.collections && (
                          <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100"><CalendarDays size={12} /> {selectedProduct.collections.collection}</span>
                        )}
                        {selectedProduct.created_at && (
                          <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-md border border-zinc-200"><Clock size={12} /> {new Date(selectedProduct.created_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button 
                      onClick={handleShareProduct} 
                      disabled={isSharing}
                      className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 active:scale-90 transition-transform mt-1 disabled:opacity-50"
                    >
                      {isSharing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} strokeWidth={2.5} />}
                    </button>
                    <button onClick={closeProductModal} className="w-10 h-10 bg-zinc-200/70 rounded-full flex items-center justify-center text-zinc-700 hover:bg-zinc-200 active:scale-90 transition-transform mt-1"><X size={20} strokeWidth={2.5} /></button>
                  </div>
              </header>
              
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 max-w-3xl mx-auto w-full pb-32">
                  <section className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm">
                    <h3 className="font-black text-lg text-zinc-900 mb-2 leading-tight">{selectedProduct.title || "Generazione titolo in corso..."}</h3>
                    <p className="text-sm text-zinc-600 leading-relaxed">{selectedProduct.description || "L'Intelligenza Artificiale sta scrivendo la descrizione di questo prodotto. Potrebbe volerci qualche istante."}</p>
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
                                    className={`relative aspect-[3/4] bg-white rounded-2xl overflow-hidden shadow-sm border border-zinc-100 cursor-zoom-in active:opacity-75 transition-all select-none ${img.enabled === false ? 'grayscale opacity-50' : ''}`}
                                    onClick={() => handleImgClick(img)}
                                    onTouchStart={(e) => handleImgTouchStart(e, img)}
                                    onTouchEnd={handleImgTouchEnd}
                                    onTouchMove={handleImgTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); toggleImageEnabled(img); }}
                                  >
                                      <img src={img.url} className="w-full h-full object-cover pointer-events-none" />
                                      {img.enabled === false && (
                                        <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px] bg-zinc-900/10">
                                          <div className="bg-black/80 text-white p-2 rounded-full shadow-lg"><EyeOff size={24} /></div>
                                        </div>
                                      )}
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="p-6 bg-white border border-zinc-100 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
                              <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-2"><Sparkles size={24} /></div>
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
                                  className={`flex-shrink-0 w-36 aspect-[3/4] bg-white rounded-2xl overflow-hidden snap-start relative cursor-zoom-in border border-zinc-200 active:opacity-75 transition-all select-none ${img.enabled === false ? 'grayscale opacity-50' : ''}`}
                                  onClick={() => handleImgClick(img)}
                                  onTouchStart={(e) => handleImgTouchStart(e, img)}
                                  onTouchEnd={handleImgTouchEnd}
                                  onTouchMove={handleImgTouchEnd}
                                  onContextMenu={(e) => { e.preventDefault(); toggleImageEnabled(img); }}
                              >
                                  <img src={img.url} className="w-full h-full object-cover pointer-events-none" />
                                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-900/80 via-zinc-900/30 to-transparent p-3 pt-8 pointer-events-none">
                                      <p className="text-white text-[10px] tracking-wider font-bold uppercase">{img.type.replace('_', ' ')}</p>
                                  </div>
                                  {img.enabled === false && (
                                    <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px] bg-zinc-900/10 pointer-events-none">
                                      <div className="bg-black/80 text-white p-2 rounded-full shadow-lg"><EyeOff size={20} /></div>
                                    </div>
                                  )}
                              </div>
                          ))}
                      </div>
                  </section>
              </div>
          </div>
        </div>
      )}

      {fullscreenImage && (
        <div className="fixed inset-0 z-[80] bg-zinc-950/95 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200">
          
          {/* VISTA EDITOR FOTO */}
          {isEditingImage ? (
            <div className="absolute inset-0 z-[100] bg-zinc-950 flex flex-col">
              <div className="flex-1 relative bg-zinc-900/50">
                <Cropper
                  image={fullscreenImage.url}
                  crop={crop}
                  zoom={zoom}
                  // Se tag -> Crop libero (undefined). Altrimenti proporzione esatta (3/4)
                  aspect={fullscreenImage.type === 'tag' ? undefined : 3/4}
                  // Permetti di zoomare in basso per fare spazio bianco se non è un tag
                  minZoom={fullscreenImage.type === 'tag' ? 1 : 0.2}
                  maxZoom={4}
                  // Se non è un tag sblocchiamo i bordi in modo che l'utente possa trascinare l'oggetto e aggiungere spazio bianco
                  restrictPosition={fullscreenImage.type === 'tag'}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(croppedArea, pixels) => setCroppedAreaPixels(pixels)}
                  style={{ containerStyle: { backgroundColor: fullscreenImage.type === 'tag' ? '#000000' : '#ffffff' } }}
                />
              </div>
              <div className="h-32 bg-zinc-900 pb-safe flex flex-col justify-center px-6 gap-4 border-t border-zinc-800">
                <div className="flex items-center gap-4 text-white">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Zoom</span>
                  <input 
                    type="range" 
                    min={fullscreenImage.type === 'tag' ? 1 : 0.2} 
                    max={3} step={0.05} 
                    value={zoom} 
                    onChange={e => setZoom(e.target.value)} 
                    className="flex-1 accent-indigo-500" 
                  />
                </div>
                <div className="flex justify-between items-center">
                  <button onClick={() => setIsEditingImage(false)} className="text-white font-medium px-4 py-2 hover:bg-white/10 rounded-xl transition-colors">Annulla</button>
                  <button onClick={handleSaveEditedImage} disabled={isSavingImage} className="bg-indigo-600 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all">
                    {isSavingImage ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {isSavingImage ? 'Salvataggio...' : 'Conferma'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* VISTA NORMALE FULLSCREEN */
            <>
              <button onClick={closeFullscreenImage} className="absolute top-6 right-6 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all z-[90] backdrop-blur-lg"><X size={24} strokeWidth={2.5} /></button>
              
              <div className="absolute top-6 left-6 flex flex-col gap-3 z-[90]">
                {fullscreenImage.type !== 'processed' && (
                  <button 
                    onClick={handleReparseTag} 
                    disabled={isReparsing}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-full hover:bg-indigo-700 active:scale-95 transition-all shadow-lg disabled:opacity-50"
                  >
                    {isReparsing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    {isReparsing ? 'Analisi in corso...' : 'Rianalizza Dati'}
                  </button>
                )}
                <button 
                  onClick={() => setIsEditingImage(true)}
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-lg text-white px-4 py-3 rounded-full hover:bg-white/20 active:scale-95 transition-all shadow-lg w-max"
                >
                  <Crop size={18} />
                  {fullscreenImage.type === 'tag' ? 'Ritaglia Etichetta' : 'Centra / Ritaglia'}
                </button>
              </div>

              {selectedProduct && selectedProduct.product_images?.length > 1 && (
                <>
                  <button onClick={(e) => navigateImage('prev', e)} className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 p-2 flex items-center justify-center active:scale-90 transition-all z-[95] text-white mix-blend-difference opacity-80 hover:opacity-100">
                    <ChevronLeft size={48} strokeWidth={2} />
                  </button>
                  <button onClick={(e) => navigateImage('next', e)} className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 p-2 flex items-center justify-center active:scale-90 transition-all z-[95] text-white mix-blend-difference opacity-80 hover:opacity-100">
                    <ChevronRight size={48} strokeWidth={2} />
                  </button>
                </>
              )}

              <TransformWrapper initialScale={1} minScale={1} maxScale={4} centerOnInit>
                <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                  <img src={fullscreenImage.url} alt="Fullscreen" className="max-w-full max-h-[90vh] object-contain shadow-2xl pointer-events-auto" />
                </TransformComponent>
              </TransformWrapper>
            </>
          )}

        </div>
      )}
    </>
  );
}