// file: /app/api/process-product-pipeline/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Configurazione per Vercel: Diamo a questa funzione fino a 60 secondi (piano Hobby) o 300s (Pro)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Usiamo una Service Role Key se possibile per ignorare le policy RLS in background, 
// altrimenti usiamo la anon key (assicurati che le policy di insert siano aperte o passagli un token JWT).
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req) {
  try {
    const formData = await req.formData();
    const productId = formData.get('productId');
    const workerId = formData.get('workerId');
    const isAccessory = formData.get('isAccessory') === 'true';
    const categoryName = formData.get('categoryName');
    const tagImage = formData.get('tagImage');
    
    const modelPosesStr = formData.get('modelPoses');
    const modelPoses = modelPosesStr ? JSON.parse(modelPosesStr) : [];

    console.log(`[Pipeline] Avvio processo per prodotto: ${productId}`);

    // Helper per l'upload su Supabase Storage
    const uploadFile = async (file, type, angle = 'none') => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileExt = file.name.split('.').pop();
      const fileName = `${productId}_${type}_${angle}_${Date.now()}.${fileExt}`;
      const filePath = `${productId}/${fileName}`;
      
      const { error } = await supabase.storage.from('product-images').upload(filePath, buffer, {
        contentType: file.type
      });
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
      return publicUrl;
    };

    // 1. Upload Cartellino
    const tagUrl = await uploadFile(tagImage, 'tag');

    // 2. Upload di tutte le foto raw
    const rawImageRecords = [];
    let i = 0;
    while (formData.has(`productImage_${i}`)) {
      const file = formData.get(`productImage_${i}`);
      const angle = formData.get(`productAngle_${i}`);
      const rawUrl = await uploadFile(file, 'raw_item', angle);
      rawImageRecords.push({ url: rawUrl, angle: angle });
      i++;
    }

    // 3. Inserimento record DB delle immagini
    const imageDbRecords = [
      { product_id: productId, url: tagUrl, type: 'tag' },
      ...rawImageRecords.map(record => ({ product_id: productId, url: record.url, type: 'raw_item' }))
    ];
    await supabase.from('product_images').insert(imageDbRecords);
    console.log(`[Pipeline] ✅ Storage completato per ${productId}`);


    // ==========================================
    // 4. PARALLELO: SEO AI & V-TON AI
    // ==========================================
    
    // Recupera i dati del prodotto per la SEO
    const { data: productData } = await supabase.from('products').select('*').eq('id', productId).single();

    const seoPromise = async () => {
       try {
          console.log("[Pipeline SEO] Avvio generazione...");
          // Costruiamo il prompt per GPT-4o (Includi qui la logica Serper se vuoi, l'ho omessa per brevità)
          const messages = [
            {
              role: "system",
              content: `Sei un copywriter di lusso. Genera Titolo SEO e Descrizione. Formato JSON: {"title": "...", "description": "..."}. Tono elegante.`
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Categoria: ${categoryName}\nModello: ${productData.model_code}\nVariante: ${productData.variant_code}` },
                { type: "image_url", image_url: { url: tagUrl } },
                // Passa fino a 3 foto raw
                ...rawImageRecords.slice(0, 3).map(r => ({ type: "image_url", image_url: { url: r.url } }))
              ]
            }
          ];

          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            response_format: { type: "json_object" },
            max_tokens: 500,
          });

          const seoData = JSON.parse(response.choices[0].message.content);
          await supabase.from('products').update({
            title: seoData.title,
            description: seoData.description
          }).eq('id', productId);
          
          console.log("[Pipeline SEO] ✅ Successo");
       } catch(e) {
          console.error("[Pipeline SEO] ❌ Errore:", e);
       }
    };

    const vtonPromises = rawImageRecords.map(async (record) => {
      try {
        if (isAccessory) {
          // TODO: Chiamata alla tua API Photoroom passandogli record.url e record.angle
          console.log(`[Pipeline VTON] Simulazione Accessorio per ${record.angle}`);
        } else {
          // TODO: Chiamata alla tua API Genlook
          console.log(`[Pipeline VTON] Simulazione Abbigliamento per ${record.angle}`);
        }
      } catch (err) {
        console.error(`[Pipeline VTON] ❌ Errore su ${record.angle}:`, err);
      }
    });

    // Eseguiamo SEO e VTON in parallelo per risparmiare tempo (il server Node.js gestisce le promesse)
    await Promise.all([
      seoPromise(),
      ...vtonPromises
    ]);

    // 5. Fine processo, aggiorniamo lo status
    await supabase.from('products').update({ status: 'completed' }).eq('id', productId);
    console.log(`[Pipeline] 🎉 Processo terminato per ${productId}`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[Pipeline] Errore critico:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}