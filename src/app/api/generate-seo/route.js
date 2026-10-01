import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Inizializza OpenAI. Se vuoi usare DeepSeek (solo testo) scommenta la baseURL.
// Per analizzare le IMMAGINI, GPT-4o è attualmente la scelta più affidabile.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
  // baseURL: 'https://api.deepseek.com', // Scommenta se usi una chiave DeepSeek
});

export async function POST(req) {
  try {
    const { modelCode, variantCode, categoryName, imageUrls, tagUrl } = await req.json();

    // Prepariamo i messaggi per il modello Vision
    const messages = [
      {
        role: "system",
        content: `Sei un copywriter esperto di moda per un e-commerce di lusso. 
Il tuo obiettivo è generare un Titolo SEO e una Descrizione persuasiva partendo dai dati forniti e analizzando le immagini del capo.
Devi seguire ESATTAMENTE questo stile e tono di voce di esempio:

Titolo Esempio: 3Juin Sandali Donna in Vernice Nera con Tacco Stiletto e Fiocchi
Descrizione Esempio: Sandali da donna firmati 3Juin, modello Megan 095, realizzati artigianalmente in Italia in 100% pregiata pelle lucida in finitura nera. Il design elegante e femminile presenta una raffinata punta aperta, un delicato cinturino alla caviglia e romantiche applicazioni di fiocchi. La calzatura è slanciata da un tacco stiletto ed è rifinita con una classica suola in cuoio. Modello MEGAN095ILLY-MAR.

REGOLE:
1. Analizza attentamente le immagini per capire colori, materiali, pattern e dettagli distintivi (es. fiocchi, colletto, zip, tacco).
2. Usa un linguaggio elegante, sartoriale e orientato alla vendita.
3. Il titolo deve essere conciso (Brand, Categoria, Dettagli principali, Colore).
4. Restituisci la risposta SOLO in formato JSON valido con due chiavi: "title" e "description". Senza markdown \`\`\`json.`
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Dati Prodotto:\n- Categoria: ${categoryName}\n- Codice Modello: ${modelCode}\n- Codice Variante: ${variantCode}\n\nAnalizza le seguenti foto (compreso il cartellino per dedurre il brand se visibile) e scrivi titolo e descrizione in formato JSON.` },
          // Aggiungiamo il cartellino per far leggere all'AI il Brand e altri dettagli testuali
          { type: "image_url", image_url: { url: tagUrl } },
          // Aggiungiamo al massimo 3 foto del prodotto per risparmiare token ma dare contesto visivo sufficiente
          ...imageUrls.slice(0, 3).map(url => ({
            type: "image_url",
            image_url: { url: url }
          }))
        ]
      }
    ];

    // Se usi DeepSeek, cambia il model in 'deepseek-chat'. Se usi OpenAI, usa 'gpt-4o'
    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: messages,
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiContent = response.choices[0].message.content;
    const parsedData = JSON.parse(aiContent);

    return NextResponse.json({ 
      title: parsedData.title, 
      description: parsedData.description 
    });

  } catch (error) {
    console.error("Errore Generazione SEO:", error);
    return NextResponse.json({ error: "Errore durante la generazione" }, { status: 500 });
  }
}