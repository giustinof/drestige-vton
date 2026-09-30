import { NextResponse } from 'next/server';
import { Genlook } from "@genlook/api";
import { supabase } from '../../../../lib/supabase';

const genlookClient = new Genlook({ apiKey: process.env.GENLOOK_API_KEY });

export async function POST(req) {
  let angle = 'sconosciuto'; // Fuori dal try per evitare crash a cascata

  try {
    const requestData = await req.json();
    const { productId, modelImageUrl, garmentImageUrl, workerId } = requestData;
    if (requestData.angle) angle = requestData.angle;

    if (!modelImageUrl || !garmentImageUrl) {
      return NextResponse.json({ error: 'Immagini mancanti per Genlook' }, { status: 400 });
    }

    // --- FASE 1: UPLOAD (Fetch puro per forzare crop: false) ---
    const modelResponse = await fetch(modelImageUrl);
    const modelArrayBuffer = await modelResponse.arrayBuffer();
    const modelBlob = new Blob([modelArrayBuffer], { type: 'image/jpeg' });

    const formData = new FormData();
    formData.append('file', modelBlob, 'model.jpg');
    formData.append('crop', 'false'); 
    formData.append('keepForDays', '1');
    if (workerId) formData.append('externalUserId', workerId);

    const uploadReq = await fetch('https://api.genlook.app/tryon/v1/images/upload', {
      method: 'POST',
      headers: { 'x-api-key': process.env.GENLOOK_API_KEY },
      body: formData
    });

    if (!uploadReq.ok) throw new Error(`Upload Genlook fallito: ${uploadReq.statusText}`);
    const { imageId } = await uploadReq.json();

    // --- FASE 2: TRY-ON ---
    const { generationId } = await genlookClient.tryOn.create({
      products: [{
        title: `Drestige Garment - ${angle}`, 
        images: [{ source: { url: garmentImageUrl } }],
      }],
      person: { image: { source: { id: imageId } } },
      externalUserId: workerId || "drestige_worker",
      output: { watermark: false, aiLabel: false }
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
      .upload(filePath, imageArrayBuffer2, { contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('product-images').getPublicUrl(filePath);

    const { error: dbError } = await supabase
      .from('product_images')
      .insert([{
        product_id: productId,
        url: publicUrl,
        type: 'processed'
      }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, url: publicUrl, angle });

  } catch (error) {
    console.error(`Errore Genlook (${angle}):`, error);
    if (error.code === 'INSUFFICIENT_CREDITS') {
       return NextResponse.json({ error: 'Crediti Genlook esauriti' }, { status: 402 });
    }
    return NextResponse.json({ error: error.message || 'Errore generazione' }, { status: 500 });
  }
}