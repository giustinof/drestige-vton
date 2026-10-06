import { NextResponse } from 'next/server';
import { Genlook } from "@genlook/api";
import { supabase } from '../../../../lib/supabase';

const genlookClient = new Genlook({ apiKey: process.env.GENLOOK_API_KEY });

export async function POST(req) {
  let angle = 'sconosciuto';

  try {
    const requestData = await req.json();
    const { productId, modelImageUrl, garmentImageUrl, workerId } = requestData;
    if (requestData.angle) angle = requestData.angle;

    if (!modelImageUrl || !garmentImageUrl) {
      return NextResponse.json({ error: 'Immagini mancanti per Genlook' }, { status: 400 });
    }

    // --- FASE 1: DOWNLOAD SICURO DA SUPABASE & UPLOAD A GENLOOK ---
    console.log(`[Pipeline VTON] Download immagine modello da: ${modelImageUrl}`);
    
    const urlParts = modelImageUrl.split('/model-assets/');
    if (urlParts.length !== 2) throw new Error("URL immagine modello non valido");
    const fileNameOnSupabase = urlParts[1];

    const { data: blobData, error: downloadError } = await supabase
      .storage
      .from('model-assets')
      .download(fileNameOnSupabase);

    if (downloadError) {
      throw new Error(`Impossibile scaricare immagine dal bucket Supabase: ${downloadError.message}`);
    }

    // Corretto il bug "ext is not defined", ora usa correttamente "extension"
    const contentType = blobData.type || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const modelArrayBuffer = await blobData.arrayBuffer();

    const { imageId } = await genlookClient.images.upload(modelArrayBuffer, {
      filename: `model_base_${angle}.${extension}`, 
      mimeType: contentType,
      crop: false, 
    });

    // --- FASE 2: TRY-ON TRAMITE CREATE (Metodo supportato da tutte le versioni SDK) ---
    const { generationId } = await genlookClient.tryOn.create({
      products: [{
        externalId: `${productId}_${angle}`, 
        title: `Drestige Garment - ${angle}`,
        description: "Capo di abbigliamento",
        images: [{ source: { url: garmentImageUrl } }],
      }],
      person: { image: { source: { id: imageId } } },
      externalUserId: workerId || "drestige_worker",
      output: { watermark: false, aiLabel: false }
    });

    // Attendiamo che Genlook finisca di elaborare l'immagine originale
    const done = await genlookClient.generations.waitFor(generationId);
    
    const tempImageUrl = done.resultImageUrl;
    if (!tempImageUrl) throw new Error("Generazione completata ma nessun URL restituito.");

    // --- FASE 3: SALVATAGGIO NEL NOSTRO SUPABASE ---
    const imageResponse = await fetch(tempImageUrl);
    if(!imageResponse.ok) throw new Error(`Fallito download risultato da Genlook. HTTP ${imageResponse.status}`);
    const imageArrayBuffer2 = await imageResponse.arrayBuffer();
    
    const processedFileName = `${productId}_processed_${angle}_${Date.now()}.jpg`;
    const filePath = `${productId}/${processedFileName}`;

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
        type: 'processed',
        angle: angle
      }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, url: publicUrl, angle });

  } catch (error) {
    console.error(`Errore Genlook (${angle}):`, error);
    return NextResponse.json({ error: error.message || 'Errore generazione' }, { status: 500 });
  }
}