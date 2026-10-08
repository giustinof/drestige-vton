import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase'; // Controlla sempre i percorsi

if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export async function POST(req) {
  let angle = 'sconosciuto'; // Variabile sicura per il catch

  try {
    const body = await req.json();
    const { productId, garmentImageUrl } = body;
    
    if (body.angle) {
      angle = body.angle;
    }

    if (!garmentImageUrl) {
      return NextResponse.json({ error: 'Immagine prodotto mancante' }, { status: 400 });
    }

    // --- FASE 1: Scarichiamo lo scatto grezzo da Supabase ---
    const imageResponse = await fetch(garmentImageUrl);
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBlob = new Blob([imageArrayBuffer], { type: 'image/jpeg' });

    // --- FASE 2: Preparazione chiamata Photoroom ---
    const formData = new FormData();
    formData.append('imageFile', imageBlob, 'product.jpg');
    
    // 1. Forza lo sfondo bianco puro
    formData.append('background.color', '#FFFFFF');
    
    // 2. Disattiva completamente il calcolo delle ombre. 
    // Questo garantisce uno scontorno netto del prodotto senza artefatti o pezzi di sfondo residui.
    formData.append('shadow.mode', 'none'); 
    
    // 3. Spazio bianco attorno al prodotto
    formData.append('padding', '0.15'); 
    
    // 4. Compressione per il web
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

    // Risultato sincrono binario
    const resultImageBuffer = await photoroomResponse.arrayBuffer();

    // --- FASE 4: Salvataggio nel bucket Supabase ---
    const fileName = `${productId}_photoroom_${angle}_${Date.now()}.jpg`;
    const filePath = `${productId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images') // IL TUO BUCKET
      .upload(filePath, resultImageBuffer, {
        contentType: 'image/jpeg',
      });

    if (uploadError) throw uploadError;

    // Recupero dell'URL pubblico
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
    console.error(`Errore Photoroom (${angle}):`, error);
    return NextResponse.json({ error: error.message || 'Errore generazione background' }, { status: 500 });
  }
}