// src/app/api/get-sync-descriptions/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Funzione helper per dividere array grandi in blocchi (evita URL troppo lunghi e il limite di 1000 righe)
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // es: 2026-10-15
    const syncAll = searchParams.get('all') === 'true'; // ?all=true prende TUTTI i 700+ prodotti!
    
    const authHeader = req.headers.get('x-api-key');
    if (authHeader !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    let productsData = [];

    // MODALITÀ 1: Sincronizza TUTTI i prodotti su Supabase che hanno descrizione/titolo (Consigliato!)
    if (syncAll || !dateParam) {
      let from = 0;
      const step = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('model_code, variant_code, title, description')
          .not('description', 'is', null)
          .neq('description', '')
          .range(from, from + step - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        productsData.push(...data);
        if (data.length < step) break; // Finiti i record
        from += step;
      }
    } 
    // MODALITÀ 2: Filtra per data di download (ma senza il bug del limite 1000!)
    else {
      // Prendiamo DA quella data in poi (così se l'hai scaricato negli ultimi 4 giorni lo prende comunque)
      const startOfDay = new Date(dateParam).toISOString();

      const { data: downloads, error: dlError } = await supabase
        .from('downloads')
        .select('product_images')
        .gte('created_at', startOfDay);

      if (dlError) throw dlError;
      if (!downloads || downloads.length === 0) {
        return NextResponse.json({ success: true, prodotti: [] });
      }

      // ID immagini unici per non mandare doppioni
      const allImageIds = [...new Set(downloads.flatMap(d => d.product_images || []))];
      if (allImageIds.length === 0) {
        return NextResponse.json({ success: true, prodotti: [] });
      }

      // Interroghiamo product_images a blocchi di 200 per non sforare i limiti di Supabase e URL
      const imageChunks = chunkArray(allImageIds, 200);
      const productIdsSet = new Set();

      for (const chunk of imageChunks) {
        const { data: imgData, error: imgError } = await supabase
          .from('product_images')
          .select('product_id')
          .in('id', chunk);

        if (imgError) throw imgError;
        imgData?.forEach(img => {
          if (img.product_id) productIdsSet.add(img.product_id);
        });
      }

      const uniqueProductIds = [...productIdsSet];

      // Interroghiamo products a blocchi di 200
      const productChunks = chunkArray(uniqueProductIds, 200);
      for (const chunk of productChunks) {
        const { data: pData, error: prodError } = await supabase
          .from('products')
          .select('model_code, variant_code, title, description')
          .in('id', chunk);

        if (prodError) throw prodError;
        if (pData) productsData.push(...pData);
      }
    }

    // Formattiamo l'output per il file PHP (rimuovendo eventuali duplicati di modello+variante)
    const uniqueMap = new Map();
    for (const p of productsData) {
      if (p.model_code && (p.title || p.description)) {
        const key = `${p.model_code}_${p.variant_code || ''}`;
        uniqueMap.set(key, {
          modello: p.model_code.trim(),
          variante: (p.variant_code || '').trim(),
          product_name: (p.title || '').trim(),
          descrizione: (p.description || '').trim()
        });
      }
    }

    const formattedProducts = Array.from(uniqueMap.values());

    return NextResponse.json({
      success: true,
      totale: formattedProducts.length,
      prodotti: formattedProducts
    });

  } catch (error) {
    console.error("Errore API Get Sync Descriptions:", error);
    return NextResponse.json({ error: error.message || "Errore del server" }, { status: 500 });
  }
}