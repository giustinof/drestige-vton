import OpenAI from 'openai';
import { normalizeComposition, normalizeMadeIn } from './composition';

if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function fileToDataUrl(file) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const mime = file.type || 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export async function imageUrlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossibile scaricare l'immagine (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const mime = contentType.split(';')[0].trim();
  const bytes = await response.arrayBuffer();
  const buffer = Buffer.from(bytes);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export async function extractCompositionFromDataUrls(dataUrls) {
  if (!Array.isArray(dataUrls) || dataUrls.length === 0) {
    return { composition: '', made_in: '' };
  }

  const prompt = `
Analizza attentamente ${dataUrls.length > 1 ? 'queste foto' : 'questa foto'} del cartellino interno (etichetta composizione / lavaggio) di un capo di abbigliamento o accessorio.
Estrai i seguenti due dati combinando le informazioni da tutte le foto fornite:

1. composition: La composizione tessile o dei materiali in italiano, in formato pulito e sintetico (es. "100% lana", "80% cotone, 20% poliestere", "Esterno: 100% pelle; Fodera: 100% cotone").
   - NON includere la parola "Composizione:" all'inizio.
   - Se l'etichetta è multilingua, riporta la versione in italiano (o traduci in italiano se manca).
   - Ignora istruzioni di lavaggio, simboli, codici RN/CA, indirizzi e taglie.
   - Se non leggibile o non presente, restituisci "".

2. made_in: Il paese di produzione nel formato "Made in <Paese>" (es. "Made in Italy", "Made in Bangladesh", "Made in China", "Made in Portugal").
   - Se sull'etichetta c'è "Fabbricato in Italia" / "Prodotto in Italia" / "Made in Italy", restituisci "Made in Italy".
   - Se non leggibile o non presente, restituisci "".

Restituisci SOLO un oggetto JSON valido in questo formato esatto, senza markdown o testo aggiuntivo:
{
  "composition": "valore o stringa vuota",
  "made_in": "valore o stringa vuota"
}
`;

  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...dataUrls.map((url) => ({
            type: 'image_url',
            image_url: { url },
          })),
        ],
      },
    ],
  });

  const responseText = response.choices[0]?.message?.content || '';
  const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleanJson);
  } catch {
    const match = cleanJson.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Risposta DeepSeek non in formato JSON valido');
    }
    parsed = JSON.parse(match[0]);
  }

  return {
    composition: normalizeComposition(parsed.composition || ''),
    made_in: normalizeMadeIn(parsed.made_in || ''),
  };
}

export async function extractCompositionFromImageUrls(imageUrls) {
  const validUrls = (imageUrls || []).filter(Boolean);
  if (validUrls.length === 0) {
    return { composition: '', made_in: '' };
  }
  const dataUrls = await Promise.all(validUrls.map(imageUrlToDataUrl));
  return extractCompositionFromDataUrls(dataUrls);
}
