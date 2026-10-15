// src/app/api/get-sync-descriptions/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // es: 2026-09-14
    
    // Sicurezza di base (opzionale ma consigliata)
    const authHeader = req.headers.get('x-api-key');
    if (authHeader !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    if (!dateParam) {
      return NextResponse.json({ error: 'Parametro date mancante' }, { status: 400 });
    }

    // 1. Definiamo l'intervallo temporale della giornata richiesta
    const startOfDay = new Date(dateParam).toISOString();
    
    const endDate = new Date(dateParam);
    endDate.setDate(endDate.getDate() + 1);
    const endOfDay = endDate.toISOString();

    // 2. Cerchiamo tutti i record di download effettuati in quel giorno
    const { data: downloads, error: dlError } = await supabase
      .from('downloads')
      .select('product_images')
      .gte('created_at', startOfDay)
      .lt('created_at', endOfDay);

    if (dlError) throw dlError;

    if (!downloads || downloads.length === 0) {
      return NextResponse.json({ success: true, prodotti: [] });
    }

    // 3. Estraiamo tutti gli ID delle immagini scaricate, appiattendo l'array
    const allImageIds = downloads.flatMap(d => d.product_images || []);

    if (allImageIds.length === 0) {
      return NextResponse.json({ success: true, prodotti: [] });
    }

    // 4. Risaliamo ai prodotti usando gli ID delle immagini.
    // Facciamo una query sulla tabella product_images per capire a quali product_id appartengono.
    const { data: imagesData, error: imgError } = await supabase
      .from('product_images')
      .select('product_id')
      .in('id', allImageIds);

    if (imgError) throw imgError;

    // Prendiamo i product_id unici
    const uniqueProductIds = [...new Set(imagesData.map(img => img.product_id))];

    // 5. Ora recuperiamo i dati SEO (title, description) e i codici (modello, variante) dalla tabella products
    const { data: productsData, error: prodError } = await supabase
      .from('products')
      .select('model_code, variant_code, title, description')
      .in('id', uniqueProductIds);

    if (prodError) throw prodError;

    // 6. Formattiamo l'output per farlo corrispondere esattamente a quello che si aspetta il file PHP
    const formattedProducts = productsData.map(p => ({
      modello: p.model_code,
      variante: p.variant_code || '',
      product_name: p.title || '',
      descrizione: p.description || ''
    })).filter(p => p.modello && (p.product_name || p.descrizione)); // Escludiamo quelli senza dati utili

    return NextResponse.json({
      success: true,
      prodotti: formattedProducts
    });

  } catch (error) {
    console.error("Errore API Get Sync Descriptions:", error);
    return NextResponse.json({ error: "Errore del server" }, { status: 500 });
  }
}