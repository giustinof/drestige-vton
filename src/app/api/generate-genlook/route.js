import { NextResponse } from 'next/server';
import { Genlook } from "@genlook/api";
import { supabase } from '../../../../lib/supabase'; // Assicurati di usare la Service Role Key se aggiorni il DB dal server

// Inizializza il client Genlook
const genlookClient = new Genlook({ apiKey: process.env.GENLOOK_API_KEY });

export async function POST(req) {
  try {
    const { productId, modelImageUrl, garmentImageUrl, angle, workerId } = await req.json();

    if (!modelImageUrl || !garmentImageUrl) {
      return NextResponse.json({ error: 'Immagini mancanti per Genlook' }, { status: 400 });
    }

    // --- FASE 1: Upload Immagine Modello ---
    // Dal momento che abbiamo un URL pubblico (da Supabase Storage),
    // dobbiamo scaricarla in un buffer per passarla al metodo di upload di Genlook.
    const modelResponse = await fetch(modelImageUrl);
    const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());

    // Genlook consiglia crop: false per scatti in studio/completi
    const { imageId } = await genlookClient.images.upload(modelBuffer, {
      mimeType: "image/jpeg",
      crop: false, // Disabilitiamo il crop per mantenere l'esatta posa del nostro modello base
      retentionDays: 1, // Possiamo tenerle per poco, ci serve solo per questa generazione
    });

    // --- FASE 2: Avvio Virtual Try-On (Inline) ---
    const { generationId } = await genlookClient.tryOn.create({
      products: [{
        // Uso un externalId generico o basato sul productId per non riempire il catalogo Genlook inutilmente
        title: "Drestige Garment", 
        description: "Outerwear or apparel", 
        images: [{ source: { url: garmentImageUrl } }],
      }],
      person: { 
        image: { source: { id: imageId } } 
      },
      // Impostiamo l'identificativo del lavoratore per tracking (opzionale)
      externalUserId: workerId || "drestige_worker",
      // --- REGISTRAZIONE OPZIONI WATERMARK E AI LABEL ---
      output: {
        watermark: true,  // Mantiene il logo caricato nella dashboard Genlook
        aiLabel: false    // Rimuove il badge visivo "AI Modified" obbligatorio EU (restano i metadati)
      }
    });

    // --- FASE 3: Polling (Gestito dall'SDK) ---
    // Il metodo waitFor attende che la generazione sia COMPLETED o lanci un errore
    const result = await genlookClient.generations.waitFor(generationId, {
      timeoutMs: 120_000, // 2 minuti di budget massimo
      pollIntervalMs: 2_000 // controlla ogni 2 secondi
    });

    const finalImageUrl = result.resultImageUrl;

    if (!finalImageUrl) {
      throw new Error("Generazione completata ma nessun URL restituito.");
    }

    // --- FASE 4: Salvataggio nel Database Supabase ---
    const { error: dbError } = await supabase
      .from('product_images')
      .insert([{
        product_id: productId,
        url: finalImageUrl,
        type: 'processed',
        // angle: angle // Se la tua tabella supporta il tracciamento dell'angolazione
      }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, url: finalImageUrl });

  } catch (error) {
    console.error("Errore Pipeline Genlook:", error);
    
    // Gestione errori tipizzata da Genlook
    if (error.code === 'INSUFFICIENT_CREDITS') {
       return NextResponse.json({ error: 'Crediti Genlook esauriti' }, { status: 402 });
    }
    
    return NextResponse.json({ error: error.message || 'Errore durante la generazione AI' }, { status: 500 });
  }
}