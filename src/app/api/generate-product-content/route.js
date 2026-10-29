import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // Adegua il path
import OpenAI from 'openai';

// Configura il client per usare le API di DeepSeek
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function POST(req) {
  try {
    const { productId, modelCode, variantCode, categoryName, imageUrls } = await req.json();

    /* 
     * Nota su DeepSeek: DeepSeek-Chat (V3) è un modello testuale eccezionale.
     * Se vuoi passargli direttamente le immagini (Vision) dovresti usare un modello
     * che lo supporta, altrimenti puoi semplicemente passargli i metadati.
     * In questo prompt gli passiamo i dati che abbiamo.
    */
    
    const prompt = `
Sei un copywriter esperto di moda per e-commerce di lusso. 
Il tuo compito è generare un "titolo" e una "descrizione" SEO per un nuovo prodotto.

Ecco un ESEMPIO DI STILE E FORMATO da seguire fedelmente:
- Titolo di esempio: 3Juin Sandali Donna in Vernice Nera con Tacco Stiletto e Fiocchi
- Descrizione di esempio: Sandali da donna firmati 3Juin, modello Megan 095, realizzati artigianalmente in Italia in 100% pregiata pelle lucida in finitura nera. Il design elegante e femminile presenta una raffinata punta aperta, un delicato cinturino alla caviglia e romantiche applicazioni di fiocchi. La calzatura è slanciata da un tacco stiletto ed è rifinita con una classica suola in cuoio. Modello MEGAN095ILLY-MAR.

DATI DEL NUOVO PRODOTTO:
Categoria/Tipologia: ${categoryName}
Codice Modello: ${modelCode}
Codice Variante: ${variantCode}

Scrivi un titolo ottimizzato (circa 60-70 caratteri) e una descrizione accattivante e orientata alla SEO (circa 40-50 parole).
Rispondi ESCLUSIVAMENTE in formato JSON con le chiavi "title" e "description", senza markdown aggiuntivo.
    `;

    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat', 
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' } // Forza la risposta in JSON
    });

    const responseContent = JSON.parse(completion.choices[0].message.content);

    // Salviamo il risultato nel Database Supabase
    const { error: updateError } = await supabase
      .from('products')
      .update({
        title: responseContent.title,
        description: responseContent.description
      })
      .eq('id', productId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, data: responseContent });

  } catch (error) {
    console.error('Errore API Testi AI:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}