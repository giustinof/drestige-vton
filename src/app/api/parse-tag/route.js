import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com', 
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const image = formData.get('image');

    if (!image) {
      return NextResponse.json({ error: 'Nessuna immagine fornita' }, { status: 400 });
    }

    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${image.type};base64,${base64Image}`;

    // PROMPT AGGIORNATO E OTTIMIZZATO PER I TUOI CARTELLINI
    const prompt = `
      Analizza questo cartellino di abbigliamento ed estrai i seguenti dati:
      1. model_code: Il codice alfanumerico del modello principale. Nelle etichette standard si trova al centro, all'inizio della riga descrittiva (es. estrai "E4700VELOUR" da "E4700VELOUR SAB 39" oppure "E4723TALCP" da "E4723TALCP NER 36").
      2. variant_code: Il codice della variante (solitamente il colore). È la parola o le 3 lettere situate subito dopo il codice modello e prima della taglia (es. estrai "SAB" per Sabbia, o "NER" per Nero e oro). ATTENZIONE: IGNORA I NUMERI alla fine della riga (es. 36, 39, ecc. sono la taglia, NON sono la variante).
      3. ean: Il codice a barre numerico a 13 cifre (rimuovi gli spazi). Cerca quello in basso a destra (es. 8000000...).
      
      Restituisci SOLO un oggetto JSON valido in questo formato esatto, senza markdown o testo aggiuntivo:
      {
        "model_code": "valore",
        "variant_code": "valore",
        "ean": "valore"
      }
    `;

    const response = await openai.chat.completions.create({
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
    });

    const responseText = response.choices[0].message.content;
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return NextResponse.json(parsedData);

  } catch (error) {
    console.error("Errore DeepSeek OCR:", error);
    return NextResponse.json({ error: 'Errore durante la lettura del cartellino' }, { status: 500 });
  }
}