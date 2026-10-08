import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req) {
  try {
    const body = await req.json();
    const { productId, workerId, isAccessory, categoryName, modelCode, variantCode, uploadedImages } = body;

    console.log(`[Pipeline] Avvio processo per: ${productId}`);

    // 1. Salvataggio record immagini grezze
    const imageDbRecords = uploadedImages.map(img => ({
      product_id: productId,
      url: img.url,
      type: img.type,
      angle: img.angle 
    }));
    await supabase.from('product_images').insert(imageDbRecords);

    // 2. Separazione tag OCR dalle foto prodotto
    const tagUrl = uploadedImages.find(i => i.type === 'tag')?.url;
    const rawImages = uploadedImages.filter(i => i.type === 'raw_item');

    // A. PROCESSO SEO
    const seoPromise = async () => {
      try {
        console.log("[Pipeline SEO] Avvio AI...");

        const systemPrompt = `Sei un copywriter esperto di moda per un e-commerce di lusso.
Il tuo obiettivo è generare un Titolo SEO ottimizzato e una Descrizione persuasiva partendo dai dati forniti e analizzando visivamente le immagini del capo (e il cartellino per riconoscere il brand).
Devi seguire ESATTAMENTE questo stile e tono di voce di esempio:

Titolo Esempio: 3Juin Sandali Donna in Vernice Nera con Tacco Stiletto e Fiocchi
Descrizione Esempio: Sandali da donna firmati 3Juin, realizzati artigianalmente in Italia in 100% pregiata pelle lucida in finitura nera. Il design elegante e femminile presenta una raffinata punta aperta, un delicato cinturino alla caviglia e romantiche applicazioni di fiocchi. La calzatura è slanciata da un tacco stiletto ed è rifinita con una classica suola in cuoio. Modello MEGAN095ILLY-MAR.

REGOLE TASSATIVE:
1. NON INSERIRE MAI taglie, misure, codici a barre (EAN) o codici variante nella descrizione.
2. NON INSERIRE il codice modello all'inizio o in mezzo alla descrizione.
3. Il codice modello (${modelCode}) DEVE ESSERE INSERITO SOLO ALLA FINE ASSOLUTA della descrizione, usando esattamente la frase: "Modello ${modelCode}."
4. Individua il Brand (se visibile), i colori, i materiali apparenti e i dettagli distintivi (es. zip, tacco, loghi).
5. Usa un linguaggio elegante, sartoriale e orientato alla vendita.
6. Il titolo deve essere conciso e incisivo (Brand, Categoria, Dettagli principali, Colore).
7. Restituisci la risposta SOLO in formato JSON valido con due chiavi esatte: "title" e "description". Senza markdown o altre scritte.`;

        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
              { type: "text", text: `Dati Prodotto:\n- Categoria: ${categoryName}\n- Codice Modello da inserire alla fine: ${modelCode}\n\nAnalizza le seguenti foto e scrivi titolo e descrizione in formato JSON.` },
              { type: "image_url", image_url: { url: tagUrl } },
              ...rawImages.slice(0, 3).map(r => ({ type: "image_url", image_url: { url: r.url } }))
            ]
          }
        ];

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: messages,
          response_format: { type: "json_object" },
          max_tokens: 500,
          temperature: 0.7,
        });

        const seoData = JSON.parse(response.choices[0].message.content);
        
        await supabase.from('products').update({ 
          title: seoData.title, 
          description: seoData.description 
        }).eq('id', productId);
        
        console.log("[Pipeline SEO] ✅ Completato con successo");
      } catch (e) {
        console.error("[Pipeline SEO] ❌ Errore:", e);
      }
    };

    // B. PROCESSI IMMAGINI (Flat Lay o Scontorno Standard)
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    const isLocal = process.env.NODE_ENV === 'development';
    const baseUrl = isLocal ? 'http://localhost:3001' : `${protocol}://${host}`;

    const imagePromises = rawImages.map(async (imgObj) => {
      try {
        // Flat Lay solo per fronte e retro dell'abbigliamento
        const needsFlatLay = !isAccessory && (imgObj.angle === 'front' || imgObj.angle === 'back');

        if (needsFlatLay) {
          console.log(`[Pipeline] Chiamo Photoroom Flat Lay per: ${imgObj.angle}`);
          
          const response = await fetch(`${baseUrl}/api/generate-flatlay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId, 
              garmentImageUrl: imgObj.url, 
              angle: imgObj.angle
            })
          });

          if (!response.ok) throw new Error(`Errore API Photoroom Flat Lay HTTP ${response.status}`);
          console.log(`[Pipeline] ✅ Flat Lay ok per ${imgObj.angle}`);

        } else {
          // Scontorno standard per accessori, etichette interne e dettagli
          console.log(`[Pipeline] Chiamo Photoroom Scontorno Standard per: ${imgObj.angle}`);
          const response = await fetch(`${baseUrl}/api/generate-product-bg`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              productId, 
              garmentImageUrl: imgObj.url, 
              angle: imgObj.angle 
            })
          });

          if (!response.ok) throw new Error(`Errore API Photoroom Scontorno HTTP ${response.status}`);
          console.log(`[Pipeline] ✅ Scontorno ok per ${imgObj.angle}`);
        }
      } catch (e) {
        console.error(`[Pipeline] ❌ Errore su ${imgObj.angle}:`, e);
      }
    });

    await Promise.all([
      seoPromise(),
      ...imagePromises
    ]);

    await supabase.from('products').update({ status: 'completed' }).eq('id', productId);
    console.log(`[Pipeline] 🎉 Processo terminato per ${productId}`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[Pipeline] Errore critico:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}