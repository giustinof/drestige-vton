import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Inizializza il client con la baseURL di DeepSeek
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com', // Endpoint standard DeepSeek
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const image = formData.get('image');

    if (!image) {
      return NextResponse.json({ error: 'Nessuna immagine fornita' }, { status: 400 });
    }

    // Converti l'immagine in Base64
    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${image.type};base64,${base64Image}`;

    const prompt = `
      Analizza questo cartellino di abbigliamento ed estrai i seguenti dati:
      1. model_code: Il codice alfanumerico del modello principale (es. ZINCHAMW204802).
      2. variant_code: Il codice della variante, spesso un numero corto vicino al codice modello o alla taglia (es. 015).
      3. ean: Il codice a barre EAN/UPC a 13 cifre (rimuovi gli spazi). Se ce ne sono due, prendi quello associato al prezzo finale o in basso.
      
      Restituisci SOLO un oggetto JSON valido in questo formato esatto, senza markdown o testo aggiuntivo:
      {
        "model_code": "valore",
        "variant_code": "valore",
        "ean": "valore"
      }
    `;

    const response = await openai.chat.completions.create({
      // NOTA: Sostituisci con l'esatto nome del modello vision di DeepSeek se diverso (es. 'deepseek-vl')
      model: 'deepseek-chat', 
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      // Se il modello lo supporta, puoi forzare il JSON aggiungendo:
      // response_format: { type: 'json_object' }
    });

    const responseText = response.choices[0].message.content;
    
    // Pulisce l'output da eventuali formattazioni markdown
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return NextResponse.json(parsedData);

  } catch (error) {
    console.error("Errore DeepSeek OCR:", error);
    return NextResponse.json({ error: 'Errore durante la lettura del cartellino' }, { status: 500 });
  }
}