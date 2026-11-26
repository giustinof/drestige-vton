// src/app/api/get-sync-descriptions/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Esegue promesse in parallelo a gruppi per velocizzare senza saturare Supabase
async function runInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const syncAll = searchParams.get('all') === 'true';

    const authHeader = req.headers.get('x-api-key');
    if (authHeader !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    let productsData = [];

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
        if (data.length < step) break;
        from += step;
      }
    } else {
      const startOfDay = new Date(dateParam).toISOString();

      // 1. Paginazione su downloads (evita il taglio a 1000 righe)
      const downloads = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('downloads')
          .select('product_images')
          .gte('created_at', startOfDay)
          .range(from, from + step - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        downloads.push(...data);
        if (data.length < step) break;
        from += step;
      }

      if (downloads.length === 0) {
        return NextResponse.json({ success: true, totale: 0, prodotti: [] });
      }

      const allImageIds = [...new Set(downloads.flatMap(d => d.product_images || []))];
      if (allImageIds.length === 0) {
        return NextResponse.json({ success: true, totale: 0, prodotti: [] });
      }

      // 2. Query parallele (6 alla volta) su product_images
      const imageChunks = chunkArray(allImageIds, 200);
      const productIdsSet = new Set();

      await runInBatches(imageChunks, 6, async (chunk) => {
        const { data, error } = await supabase
          .from('product_images')
          .select('product_id')
          .in('id', chunk);

        if (error) throw error;
        data?.forEach(img => {
          if (img.product_id) productIdsSet.add(img.product_id);
        });
      });

      const uniqueProductIds = [...productIdsSet];

      // 3. Query parallele (6 alla volta) su products
      const productChunks = chunkArray(uniqueProductIds, 200);
      await runInBatches(productChunks, 6, async (chunk) => {
        const { data, error } = await supabase
          .from('products')
          .select('model_code, variant_code, title, description')
          .in('id', chunk)
          .not('description', 'is', null)
          .neq('description', '');

        if (error) throw error;
        if (data) productsData.push(...data);
      });
    }

    // Deduplica sicura: trim sulla chiave e nessuna sovrascrittura con stringhe vuote
    const uniqueMap = new Map();
    for (const p of productsData) {
      const modello = (p.model_code || '').trim();
      const variante = (p.variant_code || '').trim();
      const title = (p.title || '').trim();
      const description = (p.description || '').trim();

      if (!modello || (!title && !description)) continue;

      const key = `${modello}_${variante}`;
      const existing = uniqueMap.get(key);

      uniqueMap.set(key, {
        modello,
        variante,
        product_name: title || existing?.product_name || '',
        descrizione: description || existing?.descrizione || ''
      });
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