import { NextResponse } from 'next/server';
import {
  extractCompositionFromDataUrls,
  extractCompositionFromImageUrls,
  fileToDataUrl,
} from '../../../../lib/deepseekComposition';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const { imageUrls } = await req.json();
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return NextResponse.json(
          { error: 'Nessun URL immagine fornito' },
          { status: 400 }
        );
      }

      const result = await extractCompositionFromImageUrls(imageUrls);
      return NextResponse.json(result);
    }

    const formData = await req.formData();
    const images = [
      ...formData.getAll('images'),
      ...formData.getAll('image'),
    ].filter((item) => item && typeof item.arrayBuffer === 'function');

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna immagine fornita' },
        { status: 400 }
      );
    }

    const dataUrls = await Promise.all(images.map(fileToDataUrl));
    const result = await extractCompositionFromDataUrls(dataUrls);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Errore DeepSeek OCR Composizione:', error);
    return NextResponse.json(
      { error: 'Errore durante la lettura del cartellino composizione' },
      { status: 500 }
    );
  }
}
