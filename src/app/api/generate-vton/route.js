import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase'; 

export async function POST(req) {
  let angle = 'sconosciuto';

  try {
    const body = await req.json();
    const { productId, garmentImageUrl, modelImageUrl } = body;
    
    if (body.angle) angle = body.angle;

    if (!garmentImageUrl || !modelImageUrl) {
      return NextResponse.json({ error: 'Immagini mancanti (capo o modello)' }, { status: 400 });
    }

    // --- FASE 1: Scarichiamo lo scatto grezzo del capo d'abbigliamento ---
    const imageResponse = await fetch(garmentImageUrl);
    if (!imageResponse.ok) throw new Error(`Impossibile scaricare capo (HTTP ${imageResponse.status})`);
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBlob = new Blob([imageArrayBuffer], { type: 'image/jpeg' });

    // --- FASE 2: Preparazione chiamata Photoroom V-TON Restrittiva ---
    const formData = new FormData();
    formData.append('imageFile', imageBlob, 'garment.jpg');
    
    // Attiviamo la modalità Virtual Try-On
    formData.append('virtualModel.mode', 'ai.auto');
    
    // 1. Passiamo il modello per le sembianze
    formData.append('virtualModel.model.custom.imageUrl', modelImageUrl);
    
    // 2. BLOCCO SCENA: Passiamo la STESSA foto del modello come scena
    // Questo impedisce a Photoroom di inventare sfondi (es. spiagge o strade)
    formData.append('virtualModel.scene.custom.imageUrl', modelImageUrl);
    
    // 3. BLOCCO POSA: Evitiamo che scelga pose random (il default è 'random')
    formData.append('virtualModel.pose', 'standing');

    // 4. BLOCCO DIMENSIONI E RITAGLIO: Impediamo che modifichi la bounding box originale
    formData.append('removeBackground', 'false');
    formData.append('referenceBox', 'originalImage');
    
    // Esportazione pulita in jpeg, niente padding aggiunto
    formData.append('export.format', 'jpeg');

    // --- FASE 3: Chiamata a Photoroom ---
    const photoroomResponse = await fetch('https://image-api.photoroom.com/v2/edit', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.PHOTOROOM_API_KEY
      },
      body: formData
    });

    if (!photoroomResponse.ok) {
        const contentType = photoroomResponse.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const errData = await photoroomResponse.json();
            throw new Error(`Errore Photoroom: ${errData.message || photoroomResponse.status}`);
        }
        throw new Error(`Errore Server Photoroom: ${photoroomResponse.status}`);
    }

    // --- FASE 4: Salvataggio nel bucket Supabase ---
    const resultImageBuffer = await photoroomResponse.arrayBuffer();
    const fileName = `${productId}_vton_${angle}_${Date.now()}.jpg`;
    const filePath = `${productId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, resultImageBuffer, { contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    // --- FASE 5: Scrittura a Database ---
    const { error: dbError } = await supabase
      .from('product_images')
      .insert([{
        product_id: productId,
        url: publicUrl,
        type: 'processed',
        angle: angle 
      }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, url: publicUrl, angle });

  } catch (error) {
    console.error(`Errore Photoroom V-TON (${angle}):`, error);
    return NextResponse.json({ error: error.message || 'Errore Virtual Try-On' }, { status: 500 });
  }
}