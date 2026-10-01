import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// IMPORTANTE: Diamo a Vercel fino a 60 secondi (o 300 su Pro) per fare il lavoro in background
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Inizializza OpenAI per la SEO visiva
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req) {
  try {
    const body = await req.json();
    const { productId, workerId, isAccessory, categoryName, modelCode, variantCode, uploadedImages } = body;

    console.log(`[Pipeline] Avvio processo per: ${productId}`);

    // 1. Salviamo i record delle immagini grezze nel DB (le foto fisiche sono già su Storage Supabase grazie al client)
    const imageDbRecords = uploadedImages.map(img => ({
      product_id: productId,
      url: img.url,
      type: img.type,
      angle: img.angle // Manteniamo traccia dell'angolo anche a database
    }));
    await supabase.from('product_images').insert(imageDbRecords);

    // 2. Separiamo il cartellino dalle foto prodotto per smistarle alle varie AI
    const tagUrl = uploadedImages.find(i => i.type === 'tag')?.url;
    const rawImages = uploadedImages.filter(i => i.type === 'raw_item');

    // ==========================================
    // 3. PROCESSI PARALLELI: SEO AI & V-TON AI
    // ==========================================

    // A. PROCESSO SEO (OpenAI)
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
              // Includiamo il tag per aiutare a leggere Brand e composizioni testuali
              { type: "image_url", image_url: { url: tagUrl } },
              // Limitiamo le foto raw a 3 per ottimizzare i token di GPT-4o
              ...rawImages.slice(0, 3).map(r => ({ type: "image_url", image_url: { url: r.url } }))
            ]
          }
        ];

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages,
          response_format: { type: "json_object" },
          max_tokens: 500,
          temperature: 0.7,
        });

        const seoData = JSON.parse(response.choices[0].message.content);
        
        // Aggiorniamo il db con i testi generati
        await supabase.from('products').update({ 
          title: seoData.title, 
          description: seoData.description 
        }).eq('id', productId);
        
        console.log("[Pipeline SEO] ✅ Completato con successo");
      } catch (e) {
        console.error("[Pipeline SEO] ❌ Errore:", e);
      }
    };

    // B. PROCESSI V-TON (Photoroom o Genlook)
    // Determiniamo dinamicamente il base URL per chiamare le nostre stesse API
    // (In produzione su Vercel, req.headers.get('host') ci dà il dominio corretto)
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    const baseUrl = `${protocol}://${host}`;

    const vtonPromises = rawImages.map(async (imgObj) => {
      try {
        if (isAccessory) {
          console.log(`[Pipeline VTON] Chiamo Photoroom per Accessorio: ${imgObj.angle}`);
          const response = await fetch(`${baseUrl}/api/generate-product-bg`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              productId, 
              garmentImageUrl: imgObj.url, 
              angle: imgObj.angle 
            })
          });

          if (!response.ok) throw new Error(`Errore API Photoroom HTTP ${response.status}`);
          console.log(`[Pipeline VTON] ✅ Photoroom ok per ${imgObj.angle}`);

        } else {
          console.log(`[Pipeline VTON] Chiamo Genlook per Capo Abbigliamento: ${imgObj.angle}`);
          
          // Recuperiamo la posa originale dal DB per passarne la base_image a Genlook
          const { data: poseInfo } = await supabase
            .from('ai_poses')
            .select('base_image_url')
            .eq('angle', imgObj.angle)
            .limit(1)
            .single();

          if (poseInfo && poseInfo.base_image_url) {
            const response = await fetch(`${baseUrl}/api/generate-genlook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId, 
                modelImageUrl: poseInfo.base_image_url, 
                garmentImageUrl: imgObj.url, 
                angle: imgObj.angle, 
                workerId
              })
            });

            if (!response.ok) throw new Error(`Errore API Genlook HTTP ${response.status}`);
            console.log(`[Pipeline VTON] ✅ Genlook ok per ${imgObj.angle}`);
          } else {
             console.warn(`[Pipeline VTON] ⚠️ Immagine base modello non trovata per angolo ${imgObj.angle}`);
          }
        }
      } catch (e) {
        console.error(`[Pipeline VTON] ❌ Errore su ${imgObj.angle}:`, e);
      }
    });

    // Avviamo tutto contemporaneamente (Node.js gestirà il parallelismo asincrono)
    await Promise.all([
      seoPromise(),
      ...vtonPromises
    ]);

    // 4. Fine processo completo, aggiorniamo lo status per farlo apparire completo nell'interfaccia
    await supabase.from('products').update({ status: 'completed' }).eq('id', productId);
    console.log(`[Pipeline] 🎉 Processo terminato per ${productId}`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[Pipeline] Errore critico:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}