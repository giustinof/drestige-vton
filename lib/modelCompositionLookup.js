import { normalizeComposition, normalizeMadeIn } from './composition.js';

/**
 * Cerca su Supabase composizione e Made in già registrati per lo stesso model_code
 * (tipicamente da una variante precedente dello stesso modello).
 */
export async function lookupModelCompositionDefaults(
  supabaseClient,
  modelCode,
  excludeProductId = null
) {
  const cleanCode = typeof modelCode === 'string' ? modelCode.trim() : '';
  if (!cleanCode) return null;

  const { data, error } = await supabaseClient.rpc('get_model_composition_defaults', {
    p_model_code: cleanCode,
    p_exclude_product_id: excludeProductId || null,
  });

  if (error) {
    console.error('Errore lookup composizione modello:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const composition = normalizeComposition(row.composition || '');
  const made_in = normalizeMadeIn(row.made_in || '');

  if (!composition && !made_in) return null;

  return {
    composition,
    made_in,
    source_variant_code: row.source_variant_code || '',
  };
}
