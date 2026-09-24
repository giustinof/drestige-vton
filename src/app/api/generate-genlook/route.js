import { NextResponse } from 'next/server';
import { Genlook } from "@genlook/api";
import { supabase } from '../../../../lib/supabase';

const genlookClient = new Genlook({ apiKey: process.env.GENLOOK_API_KEY });

export async function POST(req) {
  let requestData = {}; // Dichiarato fuori dal try-catch

  try {
    requestData = await req.json();
    const { productId, modelImageUrl, garmentImageUrl, angle, workerId } = requestData;

    if (!modelImageUrl || !garmentImageUrl) {
      return NextResponse.json({ error: 'Immagini mancanti per Genlook' }, { status: 400 });
    }

    // --- FASE 1: UPLOAD ---
    const modelResponse = await fetch(modelImageUrl);
    const modelArrayBuffer = await modelResponse.arrayBuffer();
    const modelBlob = new Blob([modelArrayBuffer], { type: 'image/jpeg' });

    const { imageId } = await genlookClient.images.upload(modelBlob, {
      mimeType: "image/jpeg",
      crop: false, 
      retentionDays: 1, 
    });

    // --- FASE 2: TRY-ON ---
    const { generationId } = await genlookClient.tryOn.create({
      products: [{
        title: `Drestige Garment - ${angle}`, 
        description: "Outerwear or apparel", 
        images: [{ source: { url: garmentImageUrl } }],
      }],
      person: { 
        image: { source: { id: imageId } } 
      },
      externalUserId: workerId || "drestige_worker",
      output: {
        watermark: true,  
        aiLabel: false    
      }
    });

    // --- FASE 3: POLLING ---
    const result = await genlookClient.generations.waitFor(generationId, {
      timeoutMs: 120_000, 
      pollIntervalMs: 2_000 
    });

    const tempImageUrl = result.resultImageUrl;
    if (!tempImageUrl) throw new Error("Generazione completata ma nessun URL restituito.");

    // --- FASE 4: SALVATAGGIO ---
    const imageResponse = await fetch(tempImageUrl);
    const imageArrayBuffer2 = await imageResponse.arrayBuffer();
    
    const fileName = `${productId}_processed_${angle}_${Date.now()}.jpg`;
    const filePath = `${productId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, imageArrayBuffer2, {
        contentType: 'image/jpeg',
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    const { error: dbError } = await supabase
      .from('product_images')
      .insert([{
        product_id: productId,
        url: publicUrl,
        type: 'processed',
        // angle: angle
      }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, url: publicUrl, angle });

  } catch (error) {
    // Ora legge l'angolo in modo sicuro o usa il fallback
    const failedAngle = requestData?.angle || 'sconosciuto';
    console.error(`Errore Genlook (${failedAngle}):`, error);
    
    if (error.code === 'INSUFFICIENT_CREDITS') {
       return NextResponse.json({ error: 'Crediti Genlook esauriti' }, { status: 402 });
    }
    
    return NextResponse.json({ error: error.message || 'Errore generazione' }, { status: 500 });
  }
}