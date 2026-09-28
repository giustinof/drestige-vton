import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';// Aggiusta il percorso del tuo client Supabase

export async function POST(req) {
  try {
    const { productId, garmentImageUrl, angle } = await req.json();

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
    
    // Il cuore della magia: diciamo a Photoroom cosa disegnare dietro l'oggetto intonso
    formData.append('background.prompt', 'Minimalist bright e-commerce studio lighting, soft grey podium, pure white backdrop');
    
    // Generiamo ombre di contatto AI super-realistiche alla base dell'oggetto
    formData.append('shadow.mode', 'ai.soft');
    
    // Diamo un po' di "respiro" all'oggetto per non farlo incollare ai bordi (margine del 10%)
    formData.append('padding', '0.1'); 
    
    // Formato di esportazione leggero e di alta qualità
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
        // Photoroom restituisce gli errori in JSON se qualcosa va storto
        const contentType = photoroomResponse.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const errData = await photoroomResponse.json();
            throw new Error(`Errore Photoroom: ${errData.message || photoroomResponse.status}`);
        }
        throw new Error(`Errore Server Photoroom: ${photoroomResponse.status}`);
    }

    // A differenza di Genlook, Photoroom è Sincrono e ci sputa fuori DIRETTAMENTE l'immagine in formato binario!
    const resultImageBuffer = await photoroomResponse.arrayBuffer();

    // --- FASE 4: Salvataggio nel bucket Supabase ---
    const fileName = `${productId}_photoroom_${angle}_${Date.now()}.jpg`;
    const filePath = `${productId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product_images') // Assicurati che questo sia il nome esatto del tuo bucket
      .upload(filePath, resultImageBuffer, {
        contentType: 'image/jpeg',
      });

    if (uploadError) throw uploadError;

    // Recupero dell'URL pubblico
    const { data: { publicUrl } } = supabase.storage
      .from('product_images')
      .getPublicUrl(filePath);

    // --- FASE 5: Scrittura a Database ---
    const { error: dbError } = await supabase
      .from('product_images')
      .insert([{
        product_id: productId,
        url: publicUrl,
        type: 'processed',
        // angle: angle // Se stai salvando l'angolazione nella tabella db
      }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, url: publicUrl, angle });

  } catch (error) {
    const failedAngle = angle || 'sconosciuto';
    console.error(`Errore Photoroom (${failedAngle}):`, error);
    return NextResponse.json({ error: error.message || 'Errore generazione background' }, { status: 500 });
  }
}