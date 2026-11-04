"use client"
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PackageOpen, Sparkles, X, Edit, Trash2, CalendarDays, Loader2, Save, CheckSquare, MoreVertical, Check, Download, AlertTriangle, EyeOff, Clock, Share2, RefreshCw, CheckCheck, ChevronLeft, ChevronRight, Crop, RotateCcw, AlertCircle, MessageSquare, Wand2, CheckCircle2, Info, Eraser, Undo2, Images, ArrowLeftRight, Bookmark, TextSelect, ScanText, Copy } from 'lucide-react';
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

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

const ACCESSORY_CATEGORIES = [
  '5cf1ce77-c2a7-4454-b1dc-43679937c471', 
  '6673c18d-e2c7-4a69-a067-2d0d20e9c169', 
  'd96de87b-c5d1-4fc8-8458-7fcddecb5419', 
  'ecb540fc-fbc7-44e1-becd-fb75a913f4a5', 
  'ee53a790-04fb-4224-b0bd-9189df283fe9'  
];

export default function InventoryView({ viewMode, workerId, refreshKey, searchQuery, activeFilter, scannedEan, setScannedEan, onRedoProduct, onSelectionModeChange }) {
  const ITEMS_PER_PAGE = 500;
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('inventoryCurrentPage');
      return saved ? parseInt(saved, 10) : 1;
    }
    return 1;
  });
  const [totalItems, setTotalItems] = useState(0);

  const [products, setProducts] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  
  // Stato per identificare il segnalibro globale (anche se in altre pagine)
  const [globalBookmarkId, setGlobalBookmarkId] = useState(null);

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, product: null });
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ model_code: '', variant_code: '', ean: '', collection_id: '', title: '', description: '', raw_text: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  const [editModalPos, setEditModalPos] = useState({ x: 0, y: 0 });
  const [isDraggingEdit, setIsDraggingEdit] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [isTextSelectMode, setIsTextSelectMode] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [lastSelectedId, setLastSelectedId] = useState(null); 
  const [deleteModal, setDeleteModal] = useState(null); 
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [isSharing, setIsSharing] = useState(false); 
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [isReparsing, setIsReparsing] = useState(false);
  const [isBulkReparsing, setIsBulkReparsing] = useState(false);
  const [isBulkReadingText, setIsBulkReadingText] = useState(false);

  const [isEditingImage, setIsEditingImage] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isSavingImage, setIsSavingImage] = useState(false);

  const [redoPromptOpen, setRedoPromptOpen] = useState(false);
  const [redoReason, setRedoReason] = useState('');
  const [isSubmittingRedo, setIsSubmittingRedo] = useState(false);
  const [isProcessingRedo, setIsProcessingRedo] = useState(false);

  const [isBulkActionsMenuOpen, setIsBulkActionsMenuOpen] = useState(false);

  const touchTimeout = useRef(null);
  const isLongPress = useRef(false);
  const imgTouchTimeout = useRef(null);
  const isImgLongPress = useRef(false);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [modalTouchStartPos, setModalTouchStartPos] = useState(null);

  const [isBulkSeoGenerating, setIsBulkSeoGenerating] = useState(false);
  const [processQueue, setProcessQueue] = useState({ active: false, total: 0, current: 0, success: 0, fail: 0 });

  const [isSwapping, setIsSwapping] = useState(false);

  const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'info' });
  const showAlert = (title, message, type = 'info') => setCustomAlert({ visible: true, title, message, type });
  const closeAlert = () => setCustomAlert({ ...customAlert, visible: false });

  const displayedProducts = products.filter(p => {
    if (activeFilter === 'downloaded') return p.status === 'downloaded';
    if (p.status === 'downloaded') return false;

    const processed = p.product_images?.filter(img => img.type === 'processed').length || 0;
    const raws = p.product_images?.filter(img => img.type !== 'processed').length || 0;
    if (activeFilter === 'processing' && (p.status !== 'processing' || processed > 0)) return false;
    if (activeFilter === 'done' && processed === 0) return false;
    if (activeFilter === 'no-photo' && (processed > 0 || raws < 0)) return false;
    return true;
  });

  const sortedDisplayedProducts = [...displayedProducts].sort((a, b) => {
    const aNeedsRedo = a.redo?.some(r => !r.done) ? 1 : 0;
    const bNeedsRedo = b.redo?.some(r => !r.done) ? 1 : 0;
    return bNeedsRedo - aNeedsRedo; 
  });
  
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, viewMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('inventoryCurrentPage', currentPage.toString());
    }
  }, [currentPage]);

  useEffect(() => {
    if (onSelectionModeChange) {
      onSelectionModeChange(isSelectionMode);
    }
  }, [isSelectionMode, onSelectionModeChange]);

  const fetchData = async () => {
    const { data: seasonsData } = await supabase.from('collections').select('*').order('created_at', { ascending: false });
    if (seasonsData) setSeasons(seasonsData);
    
    // Trova se esiste un segnalibro
    const { data: bData } = await supabase.from('products').select('id').eq('is_bookmarked', true).limit(1);
    if (bData && bData.length > 0) setGlobalBookmarkId(bData[0].id);
    else setGlobalBookmarkId(null);

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase
      .from('products')
      .select(`*, product_images(id, url, type, enabled, angle), collections(*), redo(*)`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (viewMode === 'my-products') query = query.eq('worker_id', workerId);

    if (searchQuery) {
       query = query.or(`model_code.ilike.%${searchQuery}%,ean.ilike.%${searchQuery}%`);
    }

    if (activeFilter === 'downloaded') {
       query = query.eq('status', 'downloaded');
    } else {
       query = query.neq('status', 'downloaded');
    }

    const { data, error, count } = await query;
    if (!error && data) {
      setProducts(data);
      if (count !== null) setTotalItems(count);

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

  useEffect(() => { setLoading(true); fetchData().then(() => setLoading(false)); }, [viewMode, workerId, refreshKey, currentPage, searchQuery, activeFilter]);

  const handleNavigateProduct = (direction, e) => {
    if (e) e.stopPropagation();
    if (!selectedProduct) return;
    const currentIndex = sortedDisplayedProducts.findIndex(p => p.id === selectedProduct.id);
    
    if (direction === 'next' && currentIndex < sortedDisplayedProducts.length - 1) {
      setSelectedProduct(sortedDisplayedProducts[currentIndex + 1]);
    } else if (direction === 'prev' && currentIndex > 0) {
      setSelectedProduct(sortedDisplayedProducts[currentIndex - 1]);
    }

    setTimeout(() => {
      const container = document.getElementById('product-scroll-container');
      if (container) container.scrollTo(0, 0);
    }, 0);
  };

  const handleToggleBookmark = async (productToToggle) => {
    const isCurrentlyBookmarked = productToToggle.is_bookmarked;
    
    setProducts(prev => prev.map(p => ({
      ...p,
      is_bookmarked: p.id === productToToggle.id ? !isCurrentlyBookmarked : false
    })));

    if (selectedProduct && selectedProduct.id === productToToggle.id) {
      setSelectedProduct(prev => ({ ...prev, is_bookmarked: !isCurrentlyBookmarked }));
    } else if (selectedProduct) {
      setSelectedProduct(prev => ({ ...prev, is_bookmarked: false }));
    }

    // Aggiorna lo stato globale immediatamente
    if (!isCurrentlyBookmarked) {
      setGlobalBookmarkId(productToToggle.id);
    } else {
      setGlobalBookmarkId(null);
    }

    try {
      if (!isCurrentlyBookmarked) {
        await supabase.from('products').update({ is_bookmarked: false }).eq('is_bookmarked', true);
        await supabase.from('products').update({ is_bookmarked: true }).eq('id', productToToggle.id);
      } else {
        await supabase.from('products').update({ is_bookmarked: false }).eq('id', productToToggle.id);
      }
    } catch (err) {
      console.error("Errore aggiornamento segnalibro:", err);
      showAlert("Errore", "Impossibile aggiornare il segnalibro", "error");
    }
  };

  const handleGoToBookmark = () => {
    const el = document.getElementById(`product-${globalBookmarkId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Effetto visivo rapido
      el.classList.add('ring-4', 'ring-green-500', 'transition-all');
      setTimeout(() => el.classList.remove('ring-4', 'ring-green-500'), 1500);
    } else {
      showAlert("Segnalibro non visibile", "Il segnalibro si trova in un'altra pagina. Naviga tra le pagine per visualizzarlo.", "info");
    }
  };

  const handleSwapRawProcessed = async () => {
    if (!fullscreenImage || !selectedProduct) return;
    
    const currentType = fullscreenImage.type;
    if (currentType !== 'processed' && currentType !== 'raw_item') return;

    const targetType = currentType === 'processed' ? 'raw_item' : 'processed';
    
    const counterpart = selectedProduct.product_images.find(
      img => img.type === targetType && img.angle === fullscreenImage.angle
    );

    if (!counterpart) {
      showAlert("Attenzione", "Impossibile trovare la foto corrispondente per questo angolo.", "error");
      return;
    }

    setIsSwapping(true);
    try {
      await supabase.from('product_images').update({ type: targetType }).eq('id', fullscreenImage.id);
      await supabase.from('product_images').update({ type: currentType }).eq('id', counterpart.id);

      const updatedImages = selectedProduct.product_images.map(img => {
        if (img.id === fullscreenImage.id) return { ...img, type: targetType };
        if (img.id === counterpart.id) return { ...img, type: currentType };
        return img;
      });

      const updatedProduct = { ...selectedProduct, product_images: updatedImages };
      
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setSelectedProduct(updatedProduct);
      setFullscreenImage({ ...counterpart, type: currentType });
      
      showAlert("Scambio completato", "Le foto sono state invertite con successo.", "success");
    } catch (e) {
      console.error(e);
      showAlert("Errore", "Si è verificato un errore durante lo scambio.", "error");
    } finally {
      setIsSwapping(false);
    }
  };

  useEffect(() => {
    if (scannedEan && products.length > 0) {
      const foundProduct = products.find(p => p.ean === scannedEan || p.model_code === scannedEan);
      if (foundProduct) { window.history.pushState({ modal: 'product' }, ''); setSelectedProduct(foundProduct); } 
      else alert("Nessun prodotto trovato con EAN: " + scannedEan);
      setScannedEan('');
    }
  }, [scannedEan, products, setScannedEan]);

  useEffect(() => {
    if (isSelectionMode && selectedItemIds.length === 0) {
      setIsSelectionMode(false);
      setLastSelectedId(null);
    }
  }, [selectedItemIds, isSelectionMode]);

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

  const handleBulkReprocessPhotos = async () => {
    if (selectedItemIds.length === 0) return;
    setProcessQueue({ active: true, total: selectedItemIds.length, current: 0, success: 0, fail: 0 });
    setIsSelectionMode(false);

    let success = 0;
    let fail = 0;
    const itemsToProcess = [...selectedItemIds];
    setSelectedItemIds([]);
    setLastSelectedId(null);

    for (let i = 0; i < itemsToProcess.length; i++) {
      const productId = itemsToProcess[i];
      const product = products.find(p => p.id === productId);
      
      if (!product) { 
        fail++; 
        setProcessQueue(prev => ({ ...prev, current: i + 1, fail }));
        continue; 
      }

      try {
        const processedImages = product.product_images?.filter(img => img.type === 'processed') || [];
        if (processedImages.length > 0) {
          const paths = processedImages.map(img => {
            try { return img.url.split('/product-images/')[1]; } catch(e) { return null; }
          }).filter(Boolean);
          
          if (paths.length > 0) await supabase.storage.from('product-images').remove(paths);
          await supabase.from('product_images').delete().in('id', processedImages.map(img => img.id));
        }

        await supabase.from('products').update({ status: 'processing' }).eq('id', product.id);

        const rawImages = product.product_images?.filter(img => img.type === 'raw_item') || [];
        const isAccessory = ACCESSORY_CATEGORIES.includes(product.category_id);

        for (const raw of rawImages) {
          const needsFlatLay = !isAccessory && (raw.angle === 'front' || raw.angle === 'back');
          const endpoint = needsFlatLay ? '/api/generate-flatlay' : '/api/generate-product-bg';
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: product.id,
              garmentImageUrl: raw.url,
              angle: raw.angle || 'sconosciuto'
            })
          });

          if (!response.ok) throw new Error(`Errore API per ${raw.angle}`);
        }

        await supabase.from('products').update({ status: 'completed' }).eq('id', product.id);
        success++;
      } catch (err) {
        console.error(err);
        fail++;
        await supabase.from('products').update({ status: 'draft' }).eq('id', product.id);
      }
      setProcessQueue(prev => ({ ...prev, current: i + 1, success, fail }));
    }

    setTimeout(() => {
      setProcessQueue(prev => ({ ...prev, active: false }));
      showAlert("Rielaborazione Foto Terminata", `L'operazione è conclusa.\n✅ Successi: ${success}\n❌ Falliti: ${fail}`, "success");
      fetchData(); 
    }, 2000);
  };

  const toggleSelection = (productId) => { 
    setSelectedItemIds(prev => {
      const isCurrentlySelected = prev.includes(productId);
      const newSelection = isCurrentlySelected ? prev.filter(id => id !== productId) : [...prev, productId];
      if (newSelection.length === 0) {
        setIsSelectionMode(false);
        setLastSelectedId(null);
      }
      return newSelection;
    }); 
    if (window.navigator?.vibrate) window.navigator.vibrate(50); 
  };

  const handleProductClick = (e, product) => { 
    if (isLongPress.current) return; 
    
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isCtrl || isShift || isSelectionMode) {
      e.preventDefault(); 
      setIsSelectionMode(true);

      if (isShift && lastSelectedId) {
        const currentIndex = sortedDisplayedProducts.findIndex(p => p.id === product.id);
        const lastIndex = sortedDisplayedProducts.findIndex(p => p.id === lastSelectedId);

        if (currentIndex !== -1 && lastIndex !== -1) {
          const start = Math.min(currentIndex, lastIndex);
          const end = Math.max(currentIndex, lastIndex);
          const rangeIds = sortedDisplayedProducts.slice(start, end + 1).map(p => p.id);

          setSelectedItemIds(prev => {
            const newSet = new Set(prev); 
            rangeIds.forEach(id => newSet.add(id));
            return Array.from(newSet);
          });
        } else {
          toggleSelection(product.id);
        }
        setLastSelectedId(product.id);
      } else {
        toggleSelection(product.id);
        setLastSelectedId(product.id);
      }
      return;
    }

    window.history.pushState({ modal: 'product' }, ''); 
    setSelectedProduct(product); 
    setRedoPromptOpen(false); 
    setRedoReason(''); 
  };

  const handleTouchStart = (e, product) => { 
    isLongPress.current = false; 
    touchTimeout.current = setTimeout(() => { 
      isLongPress.current = true; 
      handleContextMenuTrigger(e.touches[0].clientX, e.touches[0].clientY, product); 
    }, 500); 
  };

  const handleTouchEnd = () => { 
    if (touchTimeout.current) clearTimeout(touchTimeout.current); 
    setTimeout(() => { isLongPress.current = false; }, 100);
  };

  const handleTouchMove = () => { 
    if (touchTimeout.current) clearTimeout(touchTimeout.current); 
  };

  const handleRightClick = (e, product) => { 
    e.preventDefault(); 
    if (isLongPress.current) return;
    handleContextMenuTrigger(e.clientX, e.clientY, product); 
  };

  const handleContextMenuTrigger = (x, y, product) => {
    if (isSelectionMode) {
      if (!selectedItemIds.includes(product.id)) {
        toggleSelection(product.id);
        setLastSelectedId(product.id);
      }
    } else {
      const safeX = x + 180 > window.innerWidth ? window.innerWidth - 196 : x;
      const safeY = y + 150 > window.innerHeight ? window.innerHeight - 166 : y;
      if (window.navigator?.vibrate) window.navigator.vibrate(100);
      setContextMenu({ visible: true, x: safeX, y: safeY, product });
    }
  };

  const handleImgTouchStart = (e, img) => { 
    isImgLongPress.current = false; 
    imgTouchTimeout.current = setTimeout(() => { 
      isImgLongPress.current = true; 
      toggleImageEnabled(img); 
    }, 500); 
  };
  const handleImgTouchEnd = () => { 
    if (imgTouchTimeout.current) clearTimeout(imgTouchTimeout.current); 
    setTimeout(() => { isImgLongPress.current = false; }, 100);
  };
  const handleImgClick = (img) => { 
    if (isImgLongPress.current) return; 
    openFullscreenImage(img); 
  };

  const toggleImageEnabled = async (img) => {
    const newStatus = !img.enabled;
    if (window.navigator?.vibrate) window.navigator.vibrate(50);
    setSelectedProduct(prev => ({ ...prev, product_images: prev.product_images.map(i => i.id === img.id ? { ...i, enabled: newStatus } : i) }));
    setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, product_images: p.product_images.map(i => i.id === img.id ? { ...i, enabled: newStatus } : i) } : p));
    await supabase.from('product_images').update({ enabled: newStatus }).eq('id', img.id);
  };
  
  const closeProductModal = () => { if (window.history.state?.modal === 'product') window.history.back(); else setSelectedProduct(null); };
  
  const openFullscreenImage = (img) => { 
    window.history.pushState({ modal: 'photo' }, ''); 
    setFullscreenImage(img); 
    setIsEditingImage(false); 
    setZoom(1); 
    setIsTextSelectMode(false);
  };
  
  const closeFullscreenImage = () => { 
    if (window.history.state?.modal === 'photo') window.history.back(); 
    else { setFullscreenImage(null); setIsEditingImage(false); setIsTextSelectMode(false); } 
  };
  
  const openEditModal = (product) => { 
    if (!window.history.state || window.history.state.modal !== 'edit') {
        window.history.pushState({ modal: 'edit' }, ''); 
    }
    setEditForm({ 
      model_code: product.model_code || '', 
      variant_code: product.variant_code || '', 
      ean: product.ean || '', 
      collection_id: product.collection_id || '', 
      title: product.title || '', 
      description: product.description || '',
      raw_text: product.raw_text || ''
    }); 
    setEditingProduct(product); 
    setEditModalPos({ x: 0, y: 0 }); 
  };
  
  const closeEditModal = () => { 
    if (window.history.state?.modal === 'edit') window.history.back(); 
    else setEditingProduct(null); 
    setEditModalPos({ x: 0, y: 0 }); 
  };
  
  const openDeleteModal = (type, product = null) => { window.history.pushState({ modal: 'delete' }, ''); setDeleteModal({ type, product }); };
  const closeDeleteModal = () => { if (window.history.state?.modal === 'delete') window.history.back(); else setDeleteModal(null); };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu({ visible: false, x: 0, y: 0, product: null });
    if (contextMenu.visible) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isEditingImage) {
          setIsEditingImage(false);
          return;
        }
        if (fullscreenImage) {
          closeFullscreenImage();
          return;
        }
        if (editingProduct) {
          closeEditModal();
          return;
        }
        if (deleteModal) {
          closeDeleteModal();
          return;
        }
        if (contextMenu.visible) {
          setContextMenu({ visible: false, x: 0, y: 0, product: null });
          return;
        }
        if (selectedProduct) {
          closeProductModal();
          return;
        }
      }

      if (!selectedProduct || fullscreenImage || isEditingImage || editingProduct || deleteModal || contextMenu.visible || redoPromptOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft') handleNavigateProduct('prev');
      if (e.key === 'ArrowRight') handleNavigateProduct('next');
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProduct, fullscreenImage, isEditingImage, editingProduct, deleteModal, contextMenu.visible, redoPromptOpen, sortedDisplayedProducts]);

  const handleSelectAll = () => {
    const currentPageIds = sortedDisplayedProducts.map(p => p.id);
    const allCurrentSelected = currentPageIds.every(id => selectedItemIds.includes(id));

    if (allCurrentSelected && currentPageIds.length > 0) {
      setSelectedItemIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedItemIds(prev => {
        const newSet = new Set([...prev, ...currentPageIds]);
        return Array.from(newSet);
      });
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
          ean: parsedData.ean || '',
          raw_text: parsedData.raw_text || selectedProduct.raw_text
        }).eq('id', selectedProduct.id);

        if (!error) {
          const updatedProduct = { 
            ...selectedProduct, 
            model_code: parsedData.model_code, 
            variant_code: parsedData.variant_code || '', 
            ean: parsedData.ean || '',
            raw_text: parsedData.raw_text || selectedProduct.raw_text
          };
          setSelectedProduct(updatedProduct);
          setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
          
          if (editingProduct && editingProduct.id === selectedProduct.id) {
              setEditForm(prev => ({
                  ...prev,
                  model_code: parsedData.model_code,
                  variant_code: parsedData.variant_code || '',
                  ean: parsedData.ean || '',
                  raw_text: parsedData.raw_text || prev.raw_text
              }));
          }

          alert(`✅ Dati etichetta estratti con AI!\n\nModello: ${parsedData.model_code}\nVariante: ${parsedData.variant_code}\nEAN: ${parsedData.ean}`);
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
    setIsBulkActionsMenuOpen(false);
    if (selectedItemIds.length === 0) return;
    setIsBulkReparsing(true);

    let successCount = 0;
    let failCount = 0;

    for (const productId of selectedItemIds) {
      const product = products.find(p => p.id === productId);
      if (!product) continue;

      const rawImage = product.product_images?.find(img => img.type === 'tag') || product.product_images?.find(img => img.type !== 'processed');
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
            ean: parsedData.ean || '',
            raw_text: parsedData.raw_text || product.raw_text
          }).eq('id', product.id);

          if (!error) {
            setProducts(prev => prev.map(p => p.id === product.id ? { 
              ...p, 
              model_code: parsedData.model_code, 
              variant_code: parsedData.variant_code || '', 
              ean: parsedData.ean || '',
              raw_text: parsedData.raw_text || product.raw_text
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
    setLastSelectedId(null);
  };

  const handleBulkReadText = async () => {
    setIsBulkActionsMenuOpen(false);
    if (selectedItemIds.length === 0) return;
    setIsBulkReadingText(true);
    setProcessQueue({ active: true, total: selectedItemIds.length, current: 0, success: 0, fail: 0 });
    setIsSelectionMode(false);

    let successCount = 0;
    let failCount = 0;
    const itemsToProcess = [...selectedItemIds];
    setSelectedItemIds([]);
    setLastSelectedId(null);

    for (let i = 0; i < itemsToProcess.length; i++) {
      const productId = itemsToProcess[i];
      const product = products.find(p => p.id === productId);
      if (!product) { 
        failCount++; 
        setProcessQueue(prev => ({ ...prev, current: i + 1, fail: failCount }));
        continue; 
      }

      const rawImage = product.product_images?.find(img => img.type === 'tag') || product.product_images?.find(img => img.type !== 'processed');
      if (!rawImage) { 
        failCount++; 
        setProcessQueue(prev => ({ ...prev, current: i + 1, fail: failCount }));
        continue; 
      }

      try {
        const response = await fetch(rawImage.url);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('image', blob, 'tag_image.jpg');
        
        const apiResponse = await fetch('/api/parse-tag', { method: 'POST', body: formData });
        if (!apiResponse.ok) throw new Error('Errore API');
        
        const parsedData = await apiResponse.json();
        
        if (parsedData.raw_text) {
          const { error } = await supabase.from('products').update({
            raw_text: parsedData.raw_text
          }).eq('id', product.id);

          if (!error) {
            setProducts(prev => prev.map(p => p.id === product.id ? { 
              ...p, 
              raw_text: parsedData.raw_text
            } : p));
            successCount++;
          } else failCount++;
        } else failCount++;
      } catch (err) { failCount++; }

      setProcessQueue(prev => ({ ...prev, current: i + 1, success: successCount, fail: failCount }));
    }

    setTimeout(() => {
      setProcessQueue(prev => ({ ...prev, active: false }));
      setIsBulkReadingText(false);
      showAlert("Estrazione Testo Completata", `L'operazione è conclusa.\n✅ Successi: ${successCount}\n❌ Falliti: ${failCount}`, "success");
    }, 2000);
  };

  const handleBulkSeoGenerate = async () => {
    setIsBulkActionsMenuOpen(false);
    if (selectedItemIds.length === 0) return;
    setIsBulkSeoGenerating(true);

    let successCount = 0;
    let failCount = 0;

    for (const productId of selectedItemIds) {
      const product = products.find(p => p.id === productId);
      if (!product) continue;

      let categoryName = '';
      if (product.category_id) {
        const { data: catData } = await supabase.from('categories').select('name').eq('id', product.category_id).single();
        if (catData) categoryName = catData.name;
      }

      const tagImage = product.product_images?.find(img => img.type === 'tag');
      const tagUrl = tagImage ? tagImage.url : (product.product_images?.[0]?.url || '');
      const otherImages = product.product_images?.filter(img => img.id !== tagImage?.id).map(img => img.url) || [];

      if (!tagUrl && otherImages.length === 0) {
        failCount++;
        continue;
      }

      try {
        const apiResponse = await fetch('/api/generate-seo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelCode: product.model_code || '',
            variantCode: product.variant_code || '',
            categoryName: categoryName,
            tagUrl: tagUrl,
            imageUrls: otherImages
          })
        });

        if (!apiResponse.ok) throw new Error('Errore API SEO');
        const parsedData = await apiResponse.json();
        
        if (parsedData.title && parsedData.description) {
          const { error } = await supabase.from('products').update({
            title: parsedData.title,
            description: parsedData.description
          }).eq('id', product.id);

          if (!error) {
            setProducts(prev => prev.map(p => p.id === product.id ? { 
              ...p, 
              title: parsedData.title, 
              description: parsedData.description 
            } : p));
            
            if (selectedProduct && selectedProduct.id === product.id) {
               setSelectedProduct(prev => ({...prev, title: parsedData.title, description: parsedData.description}));
            }
            successCount++;
          } else {
            failCount++;
          }
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(err);
        failCount++;
      }
    }

    setIsBulkSeoGenerating(false);
    alert(`Generazione Titoli e Descrizioni Completata!\n\n✅ Successi: ${successCount}\n❌ Falliti: ${failCount}`);
    setSelectedItemIds([]);
    setIsSelectionMode(false);
    setLastSelectedId(null);
  };

  const handleSaveEditedImage = async () => {
    setIsSavingImage(true);
    try {
      const blob = await getCroppedImg(fullscreenImage.url, croppedAreaPixels, '#ffffff');
      const oldUrlParts = fullscreenImage.url.split('/product-images/');
      const oldPath = oldUrlParts.length > 1 ? oldUrlParts[1] : null;
      const newFileName = `${Date.now()}_edited.jpg`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(newFileName, blob, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(newFileName);

      const { error: dbError } = await supabase
        .from('product_images')
        .update({ url: publicUrl })
        .eq('id', fullscreenImage.id);

      if (dbError) throw dbError;

      if (oldPath) {
        await supabase.storage.from('product-images').remove([oldPath]);
      }

      const updatedImg = { ...fullscreenImage, url: publicUrl };
      setFullscreenImage(updatedImg);

      setProducts(prev => prev.map(p => {
        if (p.id === selectedProduct.id) {
          return { ...p, product_images: p.product_images.map(i => i.id === updatedImg.id ? updatedImg : i) };
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
    setIsBulkActionsMenuOpen(false);

    const accessoryOrder = ['side', 'front', 'back', 'top', 'sole', 'detail'];
    const apparelOrder = ['front', 'back', 'inner_tag', 'detail_1', 'detail_2'];

    try {
      const zip = new JSZip();
      const downloadedProductIds = [];
      const downloadedImageIds = [];

      for (const productId of selectedItemIds) {
        const product = products.find(p => p.id === productId);
        if (!product) continue;

        let processedImages = product.product_images?.filter(
          img => img.enabled !== false && img.type === 'processed'
        ) || [];
        
        if (processedImages.length === 0) continue; 

        const isAccessory = ACCESSORY_CATEGORIES.includes(product.category_id);
        const targetOrder = isAccessory ? accessoryOrder : apparelOrder;

        processedImages.sort((a, b) => {
          let indexA = targetOrder.indexOf(a.angle);
          let indexB = targetOrder.indexOf(b.angle);
          if (indexA === -1) indexA = 999;
          if (indexB === -1) indexB = 999;
          return indexA - indexB;
        });

        const seasonName = product.collections?.collection || 'SenzaStagione';
        const folder = zip.folder(seasonName);

        const safeModel = (product.model_code || 'MOD').replace(/[^a-zA-Z0-9_-]/g, '');
        const safeVariant = (product.variant_code || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const baseFileName = `${safeModel}${safeVariant}`;

        for (let i = 0; i < processedImages.length; i++) {
          const img = processedImages[i];
          const fileName = i === 0 ? `${baseFileName}.jpg` : `${baseFileName}_${i}.jpg`;
          
          const response = await fetch(img.url);
          const blob = await response.blob();
          
          folder.file(fileName, blob);
          downloadedImageIds.push(img.id);
        }
        downloadedProductIds.push(product.id);
      }

      if (downloadedProductIds.length === 0) {
        showAlert("Attenzione", "Nessuna foto elaborata pronta da scaricare nei prodotti selezionati.", "error");
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
      setLastSelectedId(null);

    } catch (err) {
      console.error(err);
      showAlert("Errore", "Si è verificato un errore durante la creazione dello ZIP.", "error");
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
      if (!dbError) { setProducts(prev => prev.filter(p => !selectedItemIds.includes(p.id))); setIsSelectionMode(false); setSelectedItemIds([]); setLastSelectedId(null); } else alert("Errore");
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

  const handleSubmitRedo = async () => {
    setIsSubmittingRedo(true);
    const { data, error } = await supabase.from('redo').insert({
      product_id: selectedProduct.id,
      reason: redoReason
    }).select().single();

    if (!error && data) {
      const updatedProduct = { ...selectedProduct, redo: [...(selectedProduct.redo || []), data] };
      setSelectedProduct(updatedProduct);
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setRedoPromptOpen(false);
      setRedoReason('');
    } else {
      alert("Errore nell'invio della richiesta.");
    }
    setIsSubmittingRedo(false);
  };

  const handleExecuteRedo = async (activeRedoRecord) => {
    setIsProcessingRedo(true);
    try {
      const allImages = selectedProduct.product_images || [];
      if (allImages.length > 0) {
        const paths = allImages.map(img => {
          try { return img.url.split('/product-images/')[1]; } catch(e) { return null; }
        }).filter(Boolean);
        
        if (paths.length > 0) {
          await supabase.storage.from('product-images').remove(paths);
        }
      }

      await supabase.from('products').delete().eq('id', selectedProduct.id);
      const productReference = selectedProduct.ean || selectedProduct.model_code;
      setProducts(prev => prev.filter(p => p.id !== selectedProduct.id));
      
      if (window.history.state?.modal === 'product') {
        window.history.back();
      } else {
        setSelectedProduct(null);
      }

      if (onRedoProduct) {
        setTimeout(() => {
          onRedoProduct(productReference);
        }, 300);
      }

    } catch (e) {
      console.error(e);
      alert("Errore durante l'eliminazione del prodotto.");
    } finally {
      setIsProcessingRedo(false);
    }
  };

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  if (loading) return <SkeletonGrid />;

  return (
    <>
      {processQueue.active && (
        <div className="fixed top-[197px] md:top-[88px] left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-96 bg-white text-zinc-900 rounded-xl px-4 py-3 shadow-md z-30 animate-in slide-in-from-top-2 border border-zinc-200">
           <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-emerald-500" />
                {isBulkReadingText ? 'Estrazione in corso...' : 'Elaborazione in corso...'}
              </h4>
              <span className="text-xs font-medium text-zinc-500">
                {processQueue.current} / {processQueue.total}
              </span>
           </div>
           <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-500 ease-out" 
                style={{ width: `${(processQueue.current / processQueue.total) * 100}%` }}>
              </div>
           </div>
        </div>
      )}

      {isSelectionMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 h-[80px] bg-white border-t border-zinc-200 px-4 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom-8 duration-200 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-max md:rounded-full md:px-6 md:h-16 md:border md:shadow-xl">
          <div className="flex items-center gap-3">
            <button onClick={() => { setIsSelectionMode(false); setSelectedItemIds([]); setIsBulkActionsMenuOpen(false); setLastSelectedId(null); }} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 active:scale-95 transition-all text-zinc-600"><X size={20} strokeWidth={2.5} /></button>
            <span className="font-bold text-[17px] tracking-tight text-zinc-900">{selectedItemIds.length} <span className="hidden md:inline">selezionati</span></span>
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            <button onClick={handleSelectAll} className="p-2 rounded-full hover:bg-zinc-100 active:scale-95 transition-all text-zinc-700" title="Seleziona Tutti">
              <CheckCheck size={20} strokeWidth={2.5} />
            </button>
            
            <div className="h-6 w-px bg-zinc-200 mx-1"></div>

            <button onClick={handleBulkDownload} disabled={isDownloading || isBulkReparsing || isBulkSeoGenerating || isBulkReadingText || processQueue.active} className="p-2 rounded-full hover:bg-zinc-100 active:scale-95 transition-all text-zinc-700 disabled:opacity-50" title="Scarica foto">
              {isDownloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} strokeWidth={2.5} />}
            </button>

            <button onClick={() => openDeleteModal('bulk')} disabled={isDownloading || isBulkReparsing || isBulkSeoGenerating || isBulkReadingText || processQueue.active} className="p-2 rounded-full hover:bg-red-50 text-red-600 active:scale-95 transition-all disabled:opacity-50" title="Elimina">
              <Trash2 size={20} strokeWidth={2.5} />
            </button>

            <div className="relative">
              <button 
                onClick={() => setIsBulkActionsMenuOpen(!isBulkActionsMenuOpen)}
                className={`p-2 rounded-full active:scale-95 transition-all ${isBulkActionsMenuOpen ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-zinc-100 text-zinc-700'}`}
              >
                <MoreVertical size={20} strokeWidth={2.5} />
              </button>

              {isBulkActionsMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsBulkActionsMenuOpen(false)}></div>
                  <div className="absolute bottom-full right-0 mb-4 w-56 bg-white rounded-2xl shadow-2xl border border-zinc-100 p-2 z-50 flex flex-col gap-1 animate-in zoom-in-95 origin-bottom-right">
                    <button onClick={handleBulkReparse} disabled={isBulkReparsing || processQueue.active} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-zinc-50 text-sm font-semibold text-zinc-700 transition-colors disabled:opacity-50 text-left">
                      {isBulkReparsing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Rielabora Etichette
                    </button>
                    <button onClick={handleBulkReadText} disabled={isBulkReadingText || processQueue.active} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-zinc-50 text-sm font-semibold text-zinc-700 transition-colors disabled:opacity-50 text-left">
                      {isBulkReadingText ? <Loader2 size={16} className="animate-spin" /> : <TextSelect size={16} />} Estrai Testo Etichette
                    </button>
                    <button onClick={handleBulkSeoGenerate} disabled={isBulkSeoGenerating || processQueue.active} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-zinc-50 text-sm font-semibold text-zinc-700 transition-colors disabled:opacity-50 text-left">
                      {isBulkSeoGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Genera Testi SEO
                    </button>
                    <button onClick={handleBulkReprocessPhotos} disabled={processQueue.active} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-zinc-50 text-sm font-semibold text-zinc-700 transition-colors disabled:opacity-50 text-left">
                      <Images size={16} /> Rielabora Foto AI
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      <PullToRefresh onRefresh={async () => await fetchData()} pullingContent={''} refreshingContent={<div className="flex justify-center p-4"><Loader2 className="animate-spin text-zinc-400" /></div>}>
        <div className="p-4 max-w-3xl mx-auto min-h-[70vh] relative">
          
          <div className="mb-4 px-1 flex items-center justify-between animate-in fade-in">
             <p className="text-sm font-semibold text-zinc-500">
               Visualizzati {sortedDisplayedProducts.length} su {totalItems} {totalItems === 1 ? 'prodotto totale' : 'prodotti totali'} {activeFilter === 'downloaded' ? 'in archivio' : 'trovati'}
               {totalPages > 1 && ` • Pagina ${currentPage}/${totalPages}`}
             </p>
             {globalBookmarkId && (
               <button 
                 onClick={handleGoToBookmark} 
                 className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-sm font-bold rounded-full hover:bg-green-100 transition-colors active:scale-95"
               >
                 <Bookmark size={16} fill="currentColor" />
                 <span className="hidden md:inline">Vai al segnalibro</span>
               </button>
             )}
          </div>

          {sortedDisplayedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 opacity-70">
              <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-4"><PackageOpen size={36} className="text-zinc-400" strokeWidth={1.5} /></div>
              <p className="font-semibold text-zinc-900 text-lg">Nessun prodotto trovato</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {sortedDisplayedProducts.map((product) => {
                  const processedImages = product.product_images?.filter(img => img.type === 'processed') || [];
                  const rawImages = product.product_images?.filter(img => img.type === 'raw_item') || [];
                  const coverImage = processedImages.length > 0 ? processedImages[0].url : (rawImages.length > 0 ? rawImages[0].url : null);
                  const isSelected = selectedItemIds.includes(product.id);
                  const isBookmarked = product.is_bookmarked;
                  const hasActiveRedo = product.redo?.some(r => !r.done);
                  
                  return (
                    <div key={product.id} id={`product-${product.id}`} className={`bg-white rounded-[1.25rem] p-2 shadow-sm border cursor-pointer active:scale-[0.98] transition-all select-none relative 
                      ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-2' : isBookmarked ? 'border-green-500 ring-2 ring-green-500/50' : hasActiveRedo ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-zinc-100 hover:border-zinc-200'}`}
                      onClick={(e) => handleProductClick(e, product)} onContextMenu={(e) => handleRightClick(e, product)} onTouchStart={(e) => handleTouchStart(e, product)} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove} onTouchCancel={handleTouchEnd}>
                      
                      {isSelected && (<div className="absolute top-4 right-4 bg-indigo-600 text-white rounded-full p-1 z-1 shadow-md animate-in zoom-in-75"><Check size={16} strokeWidth={3} /></div>)}
                      
                      {isBookmarked && !isSelected && (
                        <div className="absolute top-3 right-3 bg-green-500 text-white p-1.5 rounded-full z-1 shadow-sm animate-in zoom-in">
                          <Bookmark size={14} strokeWidth={3} fill="currentColor" />
                        </div>
                      )}

                      {hasActiveRedo && !isSelected && (
                        <div className="absolute top-3 left-3 bg-orange-500 text-white text-[10px] tracking-wider font-black px-2 py-1 rounded-md z-1 shadow-sm flex items-center gap-1">
                          <RotateCcw size={10} strokeWidth={3} /> DA RIFARE
                        </div>
                      )}

                      <div className="aspect-[3/4] rounded-xl bg-zinc-100 mb-3 overflow-hidden relative border border-zinc-50">
                        {coverImage ? (<img src={coverImage} alt={product.model_code} className={`w-full h-full object-cover pointer-events-none transition-opacity ${isSelected ? 'opacity-80' : ''}`} />) : (<div className="w-full h-full flex flex-col items-center justify-center text-zinc-300"><PackageOpen size={24} /></div>)}
                        {product.status === 'processing' && processedImages.length === 0 && !hasActiveRedo && (
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

              {totalPages > 1 && (
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 mt-6 mb-8">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 bg-zinc-50 rounded-xl text-sm font-semibold text-zinc-700 hover:bg-zinc-100 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    <ChevronLeft size={18} /> Precedente
                  </button>
                  
                  <span className="text-sm font-bold text-zinc-500">
                    Pagina <span className="text-zinc-900 text-lg">{currentPage}</span> di {totalPages}
                  </span>
                  
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} 
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 bg-zinc-50 rounded-xl text-sm font-semibold text-zinc-700 hover:bg-zinc-100 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    Successiva <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </PullToRefresh>

      {/* MENU CONTESTUALE */}
      {contextMenu.visible && (
        <div className="fixed z-50 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-100 p-1.5 flex flex-col min-w-[160px] animate-in fade-in zoom-in-95 duration-150" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors text-left" onClick={() => { setIsSelectionMode(true); setSelectedItemIds(prev => [...prev, contextMenu.product.id]); setLastSelectedId(contextMenu.product.id); setContextMenu({ visible: false, x: 0, y: 0, product: null }); }}><CheckSquare size={16} /> Seleziona</button>
          
          <div className="h-px bg-zinc-200/50 my-1 mx-2"></div>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-green-600 hover:bg-green-50 rounded-xl transition-colors text-left" onClick={() => { handleToggleBookmark(contextMenu.product); setContextMenu({ visible: false, x: 0, y: 0, product: null }); }}>
            <Bookmark size={16} fill={contextMenu.product.is_bookmarked ? "currentColor" : "none"} /> 
            {contextMenu.product.is_bookmarked ? 'Rimuovi Segnalibro' : 'Aggiungi Segnalibro'}
          </button>

          <div className="h-px bg-zinc-200/50 my-1 mx-2"></div>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 rounded-xl transition-colors text-left" onClick={() => { openEditModal(contextMenu.product); setContextMenu({ visible: false, x: 0, y: 0, product: null }); }}><Edit size={16} /> Modifica</button>
          
          <div className="h-px bg-zinc-200/50 my-1 mx-2"></div>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left" onClick={() => { openDeleteModal('single', contextMenu.product); setContextMenu({ visible: false, x: 0, y: 0, product: null }); }}><Trash2 size={16} /> Elimina</button>
        </div>
      )}

      {/* MODALE DI CONFERMA ELIMINAZIONE */}
      {deleteModal && (
        <div className="fixed inset-0 z-[120] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
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

      {/* MODALE MODIFICA PRODOTTO (DRAGGABLE & NON-BLOCKING SE FOTO E' APERTA) */}
      {editingProduct && (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 ${fullscreenImage ? 'pointer-events-none bg-transparent' : 'bg-zinc-950/60 backdrop-blur-sm'} animate-in fade-in duration-200`}>
          <div 
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative pointer-events-auto flex flex-col border border-zinc-100"
            style={{ transform: `translate(${editModalPos.x}px, ${editModalPos.y}px)`, transition: isDraggingEdit ? 'none' : 'transform 0.1s ease-out' }}
            onPointerDown={(e) => {
              if (e.target.closest('.drag-handle')) {
                setIsDraggingEdit(true);
                dragStartRef.current = { x: e.clientX - editModalPos.x, y: e.clientY - editModalPos.y };
                e.target.setPointerCapture(e.pointerId);
              }
            }}
            onPointerMove={(e) => {
              if (!isDraggingEdit) return;
              setEditModalPos({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
            }}
            onPointerUp={(e) => {
              if (isDraggingEdit) {
                setIsDraggingEdit(false);
                e.target.releasePointerCapture(e.pointerId);
              }
            }}
          >
            {/* MANIGLIA PER IL DRAG & DROP (DESKTOP) */}
            <div className="drag-handle w-full h-8 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-t-3xl pt-3 pb-2 touch-none">
               <div className="w-12 h-1.5 bg-zinc-200 rounded-full"></div>
            </div>

            <div className="px-6 pb-6 pt-2 h-full max-h-[85vh] overflow-y-auto hide-scrollbar">
              <button onClick={closeEditModal} className="absolute top-5 right-5 p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors"><X size={18} strokeWidth={2.5} /></button>
              <h3 className="text-xl font-black text-zinc-900 mb-6">Modifica Prodotto</h3>
              <div className="space-y-4">
                <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Modello</label><input type="text" value={editForm.model_code} onChange={e => setEditForm({...editForm, model_code: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
                <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Variante</label><input type="text" value={editForm.variant_code} onChange={e => setEditForm({...editForm, variant_code: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
                <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Codice a Barre (EAN)</label><input type="text" value={editForm.ean} onChange={e => setEditForm({...editForm, ean: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
                <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Stagione</label>
                  <select value={editForm.collection_id} onChange={e => setEditForm({...editForm, collection_id: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none appearance-none"><option value="" disabled>Nessuna stagione</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.collection}</option>)}</select>
                </div>
                <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Titolo SEO</label><input type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none" /></div>
                <div><label className="text-xs font-bold text-zinc-500 uppercase ml-1 mb-1 block">Descrizione Prodotto</label><textarea rows={3} value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none resize-none" /></div>
                
                {/* --- SEZIONE RAW TEXT (RETE DI SALVATAGGIO OCR) --- */}
                {editForm.raw_text && (
                  <div className="pt-2">
                    <label className="text-xs font-bold text-indigo-500 uppercase ml-1 mb-1 flex items-center gap-1">
                      <ScanText size={12} /> Testo originale etichetta (Copia & Incolla)
                    </label>
                    <textarea 
                      readOnly 
                      value={editForm.raw_text} 
                      className="w-full bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-3 text-indigo-900 text-xs font-mono focus:outline-none resize-none selection:bg-indigo-200" 
                      rows={4} 
                    />
                  </div>
                )}
              </div>
              <button onClick={handleSaveEdit} disabled={isUpdating} className="w-full mt-6 bg-zinc-900 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-zinc-900/20">{isUpdating ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}{isUpdating ? 'Salvataggio...' : 'Salva Modifiche'}</button>
            </div>
          </div>
        </div>
      )}

      {/* VISTA PRODOTTO */}
      {selectedProduct && !editingProduct && (() => {
        const activeRedoRecord = selectedProduct.redo?.find(r => !r.done);
        
        const currentIndex = sortedDisplayedProducts.findIndex(p => p.id === selectedProduct.id);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < sortedDisplayedProducts.length - 1;

        return (
          <div className="fixed inset-0 z-40 bg-zinc-900/30 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
            
            {hasPrev && (
              <button 
                onClick={(e) => handleNavigateProduct('prev', e)}
                className="hidden md:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/90 hover:bg-white backdrop-blur-md rounded-full items-center justify-center shadow-2xl text-zinc-800 z-50 transition-all active:scale-95 border border-zinc-200"
              >
                <ChevronLeft size={32} strokeWidth={2.5} />
              </button>
            )}
            {hasNext && (
              <button 
                onClick={(e) => handleNavigateProduct('next', e)}
                className="hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/90 hover:bg-white backdrop-blur-md rounded-full items-center justify-center shadow-2xl text-zinc-800 z-50 transition-all active:scale-95 border border-zinc-200"
              >
                <ChevronRight size={32} strokeWidth={2.5} />
              </button>
            )}

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
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button 
                        onClick={() => handleToggleBookmark(selectedProduct)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform mt-1 ${selectedProduct.is_bookmarked ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'} active:scale-90`}
                        title="Segnalibro"
                      >
                        <Bookmark size={18} strokeWidth={2.5} fill={selectedProduct.is_bookmarked ? "currentColor" : "none"} />
                      </button>

                      <button 
                        onClick={() => openEditModal(selectedProduct)}
                        className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-700 hover:bg-zinc-200 active:scale-90 transition-transform mt-1"
                        title="Modifica prodotto"
                      >
                        <Edit size={18} strokeWidth={2.5} />
                      </button>

                      <button onClick={handleShareProduct} disabled={isSharing} className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 active:scale-90 transition-transform mt-1 disabled:opacity-50">
                        {isSharing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} strokeWidth={2.5} />}
                      </button>
                      
                      <button onClick={closeProductModal} className="w-10 h-10 bg-zinc-200/70 rounded-full flex items-center justify-center text-zinc-700 hover:bg-zinc-200 active:scale-90 transition-transform mt-1"><X size={20} strokeWidth={2.5} /></button>
                    </div>
                </header>
                
                <div id="product-scroll-container" className="flex-1 overflow-y-auto p-4 md:p-6 w-full pb-32 max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10">
                        
                        {/* SINISTRA: FOTO ORIGINALI (SOLO DESKTOP) */}
                        <div className="hidden md:flex md:col-span-4 lg:col-span-3 flex-col gap-4">
                            <h3 className="font-bold text-lg text-zinc-900">Scatti Originali</h3>
                            {selectedProduct.product_images?.filter(img => img.type !== 'processed').map((img, i) => (
                                <div 
                                    key={`desktop-raw-${i}`} 
                                    className={`w-full aspect-[3/4] bg-white rounded-2xl overflow-hidden relative cursor-zoom-in border border-zinc-200 active:opacity-75 transition-all select-none ${img.enabled === false ? 'grayscale opacity-50' : ''}`}
                                    onClick={() => handleImgClick(img)}
                                    onTouchStart={(e) => handleImgTouchStart(e, img)}
                                    onTouchEnd={handleImgTouchEnd}
                                    onTouchMove={handleImgTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); toggleImageEnabled(img); }}
                                >
                                    <img src={img.url} className="w-full h-full object-cover pointer-events-none" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-900/80 via-zinc-900/30 to-transparent p-4 pt-12 pointer-events-none">
                                        <p className="text-white text-xs tracking-wider font-bold uppercase">{img.type.replace('_', ' ')}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* DESTRA (SU DESKTOP) / MAIN (SU MOBILE) */}
                        <div className="md:col-span-8 lg:col-span-9 flex flex-col space-y-8">
                            
                            {activeRedoRecord && (
                              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-start gap-3 mb-4">
                                  <AlertCircle className="text-orange-500 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <h4 className="text-orange-900 font-bold text-lg leading-tight">Prodotto da rifare</h4>
                                    <p className="text-orange-700 text-sm mt-1">{activeRedoRecord.reason || "Nessuna motivazione specificata."}</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleExecuteRedo(activeRedoRecord)} 
                                  disabled={isProcessingRedo} 
                                  className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-700 active:scale-95 transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50"
                                >
                                  {isProcessingRedo ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                                  {isProcessingRedo ? 'Reset in corso...' : 'Elimina tutte le foto e Rifai'}
                                </button>
                              </div>
                            )}

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
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-6 bg-white border border-zinc-100 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
                                        <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-2"><Sparkles size={24} /></div>
                                        <p className="text-sm font-medium text-zinc-600">Nessuna foto generata</p>
                                    </div>
                                )}
                            </section>

                            {/* FOTO ORIGINALI (SOLO MOBILE) */}
                            <section className="block md:hidden">
                                <h3 className="font-bold text-lg mb-4 text-zinc-900">Scatti Originali</h3>
                                <div className="flex overflow-x-auto gap-3 pb-4 snap-x hide-scrollbar">
                                    {selectedProduct.product_images?.filter(img => img.type !== 'processed').map((img, i) => (
                                        <div 
                                            key={`mobile-raw-${i}`} 
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
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {!activeRedoRecord && selectedProduct.product_images?.filter(img => img.type === 'processed').length > 0 && (
                              <section>
                                {redoPromptOpen ? (
                                  <div className="bg-zinc-100 border border-zinc-200 rounded-2xl p-4 animate-in fade-in zoom-in-95 duration-200">
                                    <label className="text-xs font-bold text-zinc-600 uppercase ml-1 mb-2 block">Motivazione (Opzionale)</label>
                                    <textarea 
                                      placeholder="Es. colori diversi, texture rovinata..." 
                                      value={redoReason} 
                                      onChange={e => setRedoReason(e.target.value)} 
                                      rows={2}
                                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 font-medium focus:ring-2 focus:ring-zinc-900 outline-none resize-none mb-3"
                                    />
                                    <div className="flex gap-2">
                                      <button onClick={() => setRedoPromptOpen(false)} className="flex-1 py-3 bg-zinc-200 text-zinc-700 font-bold rounded-xl active:scale-95 transition-all">Annulla</button>
                                      <button onClick={handleSubmitRedo} disabled={isSubmittingRedo} className="flex-1 py-3 bg-zinc-900 text-white font-bold rounded-xl active:scale-95 transition-all flex justify-center items-center gap-2">
                                        {isSubmittingRedo ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />} 
                                        Invia Richiesta
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setRedoPromptOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl active:scale-95 transition-all border border-zinc-200"
                                  >
                                    <RotateCcw size={18} /> Chiedi di rifare
                                  </button>
                                )}
                              </section>
                            )}
                            
                        </div>
                    </div>
                </div>
            </div>
          </div>
        );
      })()}

      {/* FOTO A TUTTO SCHERMO */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-[80] bg-zinc-950/95 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200">
          
          {isEditingImage ? (
            <div className="absolute inset-0 z-[100] bg-zinc-950 flex flex-col">
              <div className="flex-1 relative bg-zinc-900/50">
                <Cropper
                  image={fullscreenImage.url}
                  crop={crop}
                  zoom={zoom}
                  aspect={fullscreenImage.type === 'tag' ? undefined : 3/4}
                  minZoom={fullscreenImage.type === 'tag' ? 1 : 0.2}
                  maxZoom={4}
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
            <>
              {/* CHIUDI FOTO */}
              <button onClick={closeFullscreenImage} className="absolute top-6 right-6 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all z-[90] backdrop-blur-lg"><X size={24} strokeWidth={2.5} /></button>
              
              {/* AZIONI OVERLAY FOTO */}
              <div className="absolute top-6 left-6 flex flex-col gap-3 z-[90]">
                
                {/* APRI MASCHERA MODIFICA CON FOTO APERTA */}
                <button 
                  onClick={() => openEditModal(selectedProduct)}
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-lg text-white px-4 py-3 rounded-full hover:bg-white/20 active:scale-95 transition-all shadow-lg w-max"
                >
                  <Edit size={18} /> Modifica Info
                </button>
                
                {/* AZIONE TAG: AI o Selezione */}
                {(fullscreenImage.type === 'tag' || fullscreenImage.angle === 'inner_tag' || fullscreenImage.angle === 'detail_1') && (
                  <>
                    <button 
                      onClick={() => setIsTextSelectMode(!isTextSelectMode)}
                      className={`flex items-center gap-2 backdrop-blur-lg text-white px-4 py-3 rounded-full hover:bg-white/20 active:scale-95 transition-all shadow-lg w-max ${isTextSelectMode ? 'bg-indigo-600/90' : 'bg-white/10'}`}
                    >
                      <TextSelect size={18} /> {isTextSelectMode ? 'Selezione Libera: ON' : 'Seleziona Testo (Live Text)'}
                    </button>
                    
                    <button 
                      onClick={handleReparseTag}
                      disabled={isReparsing}
                      className="flex items-center gap-2 bg-indigo-600/90 backdrop-blur-lg text-white px-4 py-3 rounded-full hover:bg-indigo-700 active:scale-95 transition-all shadow-lg w-max disabled:opacity-50"
                    >
                      {isReparsing ? <Loader2 size={18} className="animate-spin" /> : <ScanText size={18} />} 
                      Auto-Compila da Foto (AI)
                    </button>
                  </>
                )}

                {(fullscreenImage.type === 'processed' || fullscreenImage.type === 'raw_item') && 
                 selectedProduct.product_images?.some(img => img.angle === fullscreenImage.angle && img.type === (fullscreenImage.type === 'processed' ? 'raw_item' : 'processed')) && (
                  <button 
                    onClick={handleSwapRawProcessed} 
                    disabled={isSwapping}
                    className="flex items-center gap-2 bg-zinc-800/90 backdrop-blur-lg text-white px-4 py-3 rounded-full hover:bg-zinc-700 active:scale-95 transition-all shadow-lg w-max disabled:opacity-50"
                  >
                    {isSwapping ? <Loader2 size={18} className="animate-spin" /> : <ArrowLeftRight size={18} />} 
                    {fullscreenImage.type === 'processed' ? 'Usa Originale come Definitiva' : 'Usa come Definitiva'}
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

              {/* NAVIGAZIONE */}
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

              <TransformWrapper initialScale={1} minScale={1} maxScale={4} centerOnInit disabled={isTextSelectMode}>
                <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                  <img 
                    src={fullscreenImage.url} 
                    alt="Fullscreen" 
                    className={`max-w-full max-h-[90vh] object-contain shadow-2xl ${isTextSelectMode ? 'pointer-events-auto cursor-text' : 'pointer-events-auto'}`}
                    style={{ userSelect: isTextSelectMode ? 'auto' : 'none', WebkitUserSelect: isTextSelectMode ? 'auto' : 'none' }}
                  />
                </TransformComponent>
              </TransformWrapper>
            </>
          )}

        </div>
      )}

      {/* --- CUSTOM ALERT OVERLAY --- */}
      {customAlert.visible && (
        <div className="fixed inset-0 z-[120] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center flex flex-col items-center">
            {customAlert.type === 'success' && <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4 border-4 border-emerald-100"><CheckCircle2 size={32} strokeWidth={2.5} /></div>}
            {customAlert.type === 'error' && <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 border-4 border-red-100"><AlertTriangle size={32} strokeWidth={2.5} /></div>}
            {customAlert.type === 'info' && <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4 border-4 border-blue-100"><Info size={32} strokeWidth={2.5} /></div>}
            
            <h3 className="text-xl font-black text-zinc-900 mb-2">{customAlert.title}</h3>
            <p className="text-sm text-zinc-600 font-medium mb-6 whitespace-pre-line leading-relaxed">{customAlert.message}</p>
            <button onClick={closeAlert} className="w-full bg-zinc-900 text-white font-bold py-3.5 rounded-xl hover:bg-zinc-800 active:scale-95 transition-all shadow-lg">Ok, chiudi</button>
          </div>
        </div>
      )}
    </>
  );
}