import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductWithGtin {
  gtin?: string;
  name: string;
  price?: number | string;
  special?: string;
  pricing?: { price: number; promotionalPrice?: number; };
  promotionalPrice?: number | string;
  store: string;
  [key: string]: any;
}

interface ComparedProduct {
  gtin: string;
  name: string;
  italo?: { price: number };
  marcon?: { price: number };
  alfa?: { price: number };
  bestStore: string;
  bestPrice: number;
  worstStore: string;
  worstPrice: number;
  stores: string[];
  matchType: 'gtin' | 'description';
}

function extractPrice(product: ProductWithGtin): number | null {
  if (product.pricing?.promotionalPrice) return product.pricing.promotionalPrice;
  if (product.pricing?.price) return product.pricing.price;
  if (typeof product.promotionalPrice === 'number') return product.promotionalPrice;
  if (typeof product.price === 'number') return product.price;
  if (product.special && typeof product.special === 'string') {
    const parsed = parseFloat(product.special.replace("R$", "").replace(",", ".").trim());
    if (!isNaN(parsed)) return parsed;
  }
  if (product.price && typeof product.price === 'string') {
    const parsed = parseFloat(product.price.replace("R$", "").replace(",", ".").trim());
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function normalizeGtin(gtin: string | undefined): string {
  if (!gtin) return '';
  return gtin.toString().trim();
}

function normalizeDescription(str: string): string {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(kg|g|ml|l|lt|un|und|unid|pct|pc|cx|lata|garrafa|pet|pack)\b/gi, "")
    .replace(/\b(promocao|oferta|leve|pague|gratis|desconto|super|mega|hiper)\b/gi, "")
    .replace(/\s+/g, " ").trim();
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeDescription(str1);
  const s2 = normalizeDescription(str2);
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const tokens1 = s1.split(' ').filter(t => t.length > 1);
  const tokens2 = s2.split(' ').filter(t => t.length > 1);
  if (!tokens1.length || !tokens2.length) return 0;
  const common = tokens1.filter(t => tokens2.includes(t));
  return (common.length * 2) / (tokens1.length + tokens2.length);
}

function findBestMatch(product: ProductWithGtin, candidates: ProductWithGtin[], threshold = 0.6): { match: ProductWithGtin; score: number } | null {
  let best: ProductWithGtin | null = null, bestScore = 0;
  for (const c of candidates) {
    const score = calculateSimilarity(product.name, c.name);
    if (score > bestScore && score >= threshold) { bestScore = score; best = c; }
  }
  return best ? { match: best, score: bestScore } : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { italoProducts = [], marconProducts = [], alfaProducts = [] } = await req.json();
    console.log(`Comparing: Italo(${italoProducts.length}), Marcon(${marconProducts.length}), Alfa(${alfaProducts.length})`);

    const italoByGtin = new Map<string, ProductWithGtin>(), italoNoGtin: ProductWithGtin[] = [];
    italoProducts.forEach((p: ProductWithGtin) => { const g = normalizeGtin(p.gtin); g && g.length >= 8 ? italoByGtin.set(g, p) : italoNoGtin.push(p); });
    const marconByGtin = new Map<string, ProductWithGtin>(), marconNoGtin: ProductWithGtin[] = [];
    marconProducts.forEach((p: ProductWithGtin) => { const g = normalizeGtin(p.gtin); g && g.length >= 8 ? marconByGtin.set(g, p) : marconNoGtin.push(p); });
    const alfaByGtin = new Map<string, ProductWithGtin>(), alfaNoGtin: ProductWithGtin[] = [];
    alfaProducts.forEach((p: ProductWithGtin) => { const g = normalizeGtin(p.gtin); g && g.length >= 8 ? alfaByGtin.set(g, p) : alfaNoGtin.push(p); });

    const comparedProducts: ComparedProduct[] = [];
    const matchedGtins = new Set<string>();
    const allGtins = new Set([...italoByGtin.keys(), ...marconByGtin.keys(), ...alfaByGtin.keys()]);

    for (const gtin of allGtins) {
      const ip = italoByGtin.get(gtin), mp = marconByGtin.get(gtin), ap = alfaByGtin.get(gtin);
      if ([ip, mp, ap].filter(Boolean).length < 2) continue;
      const prices: { store: string; price: number }[] = [];
      const iprice = ip ? extractPrice(ip) : null; if (iprice) prices.push({ store: 'italo', price: iprice });
      const mprice = mp ? extractPrice(mp) : null; if (mprice) prices.push({ store: 'marcon', price: mprice });
      const aprice = ap ? extractPrice(ap) : null; if (aprice) prices.push({ store: 'alfa', price: aprice });
      if (prices.length < 2) continue;
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      comparedProducts.push({ gtin, name: ip?.name || mp?.name || ap?.name || '', italo: iprice ? { price: iprice } : undefined,
        marcon: mprice ? { price: mprice } : undefined, alfa: aprice ? { price: aprice } : undefined,
        bestStore: sorted[0].store, bestPrice: sorted[0].price, worstStore: sorted[sorted.length-1].store, worstPrice: sorted[sorted.length-1].price,
        stores: prices.map(p => p.store), matchType: 'gtin' });
      matchedGtins.add(gtin);
    }
    console.log(`GTIN matches: ${comparedProducts.length}`);

    const unmatchedItalo = [...italoByGtin.entries()].filter(([g]) => !matchedGtins.has(g)).map(([_, p]) => p).concat(italoNoGtin);
    const unmatchedMarcon = [...marconByGtin.entries()].filter(([g]) => !matchedGtins.has(g)).map(([_, p]) => p).concat(marconNoGtin);
    const unmatchedAlfa = [...alfaByGtin.entries()].filter(([g]) => !matchedGtins.has(g)).map(([_, p]) => p).concat(alfaNoGtin);
    console.log(`Unmatched: Italo(${unmatchedItalo.length}), Marcon(${unmatchedMarcon.length}), Alfa(${unmatchedAlfa.length})`);

    let descMatches = 0;
    const processed = new Set<string>();
    for (const ip of unmatchedItalo) {
      const norm = normalizeDescription(ip.name); if (processed.has(norm)) continue;
      const mm = findBestMatch(ip, unmatchedMarcon), am = findBestMatch(ip, unmatchedAlfa);
      if (!mm && !am) continue;
      const prices: { store: string; price: number }[] = [];
      const iprice = extractPrice(ip); if (iprice) prices.push({ store: 'italo', price: iprice });
      const mprice = mm ? extractPrice(mm.match) : null; if (mprice) prices.push({ store: 'marcon', price: mprice });
      const aprice = am ? extractPrice(am.match) : null; if (aprice) prices.push({ store: 'alfa', price: aprice });
      if (prices.length < 2) continue;
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      const gtin = normalizeGtin(ip.gtin) || (mm ? normalizeGtin(mm.match.gtin) : '') || (am ? normalizeGtin(am.match.gtin) : '') || `DESC-${descMatches}`;
      comparedProducts.push({ gtin, name: ip.name, italo: iprice ? { price: iprice } : undefined, marcon: mprice ? { price: mprice } : undefined,
        alfa: aprice ? { price: aprice } : undefined, bestStore: sorted[0].store, bestPrice: sorted[0].price, worstStore: sorted[sorted.length-1].store,
        worstPrice: sorted[sorted.length-1].price, stores: prices.map(p => p.store), matchType: 'description' });
      processed.add(norm); if (mm) processed.add(normalizeDescription(mm.match.name)); if (am) processed.add(normalizeDescription(am.match.name));
      descMatches++;
    }
    const remMarcon = unmatchedMarcon.filter(p => !processed.has(normalizeDescription(p.name)));
    const remAlfa = unmatchedAlfa.filter(p => !processed.has(normalizeDescription(p.name)));
    for (const mp of remMarcon) {
      const norm = normalizeDescription(mp.name); if (processed.has(norm)) continue;
      const am = findBestMatch(mp, remAlfa); if (!am) continue;
      const prices: { store: string; price: number }[] = [];
      const mprice = extractPrice(mp); if (mprice) prices.push({ store: 'marcon', price: mprice });
      const aprice = extractPrice(am.match); if (aprice) prices.push({ store: 'alfa', price: aprice });
      if (prices.length < 2) continue;
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      comparedProducts.push({ gtin: normalizeGtin(mp.gtin) || normalizeGtin(am.match.gtin) || `DESC-${descMatches}`, name: mp.name,
        italo: undefined, marcon: mprice ? { price: mprice } : undefined, alfa: aprice ? { price: aprice } : undefined,
        bestStore: sorted[0].store, bestPrice: sorted[0].price, worstStore: sorted[sorted.length-1].store, worstPrice: sorted[sorted.length-1].price,
        stores: prices.map(p => p.store), matchType: 'description' });
      processed.add(norm); processed.add(normalizeDescription(am.match.name)); descMatches++;
    }
    console.log(`Description matches: ${descMatches}`);
    comparedProducts.sort((a, b) => a.name.localeCompare(b.name));
    const gtinCount = comparedProducts.filter(p => p.matchType === 'gtin').length;
    const stats = { totalMatches: comparedProducts.length, gtinMatches: gtinCount, descriptionMatches: descMatches,
      italoBest: comparedProducts.filter(p => p.bestStore === 'italo').length, marconBest: comparedProducts.filter(p => p.bestStore === 'marcon').length,
      alfaBest: comparedProducts.filter(p => p.bestStore === 'alfa').length };
    console.log(`Complete: ${stats.totalMatches} (${stats.gtinMatches} GTIN + ${stats.descriptionMatches} desc)`);
    return new Response(JSON.stringify({ success: true, comparedProducts, stats }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});