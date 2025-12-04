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
  const g = gtin.toString().trim();
  // Ignore invalid GTINs like "0"
  if (g === '0' || g.length < 8) return '';
  return g;
}

function normalizeDescription(str: string): string {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(kg|g|ml|l|lt|un|und|unid|pct|pc|cx|lata|garrafa|pet|pack)\b/gi, "")
    .replace(/\b(promocao|oferta|leve|pague|gratis|desconto|super|mega|hiper)\b/gi, "")
    .replace(/\d+/g, " ") // Remove numbers for better matching
    .replace(/\s+/g, " ").trim();
}

function getTokens(str: string): string[] {
  return normalizeDescription(str).split(' ').filter(t => t.length > 2);
}

// Build inverted index: token -> products that contain it
function buildTokenIndex(products: ProductWithGtin[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (let i = 0; i < products.length; i++) {
    const tokens = getTokens(products[i].name);
    for (const t of tokens) {
      if (!index.has(t)) index.set(t, new Set());
      index.get(t)!.add(i);
    }
  }
  return index;
}

// Find candidate matches using token overlap (much faster than O(n²))
function findCandidates(product: ProductWithGtin, targetProducts: ProductWithGtin[], tokenIndex: Map<string, Set<number>>, maxCandidates = 50): number[] {
  const tokens = getTokens(product.name);
  const candidateCounts = new Map<number, number>();
  
  for (const t of tokens) {
    const indices = tokenIndex.get(t);
    if (indices) {
      for (const idx of indices) {
        candidateCounts.set(idx, (candidateCounts.get(idx) || 0) + 1);
      }
    }
  }
  
  // Sort by overlap count, take top candidates
  return [...candidateCounts.entries()]
    .filter(([_, count]) => count >= 2) // At least 2 tokens in common
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCandidates)
    .map(([idx]) => idx);
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

function findBestMatchOptimized(
  product: ProductWithGtin, 
  candidates: number[], 
  targetProducts: ProductWithGtin[], 
  threshold = 0.55
): { match: ProductWithGtin; score: number; idx: number } | null {
  let best: ProductWithGtin | null = null;
  let bestScore = 0;
  let bestIdx = -1;
  
  for (const idx of candidates) {
    const c = targetProducts[idx];
    const score = calculateSimilarity(product.name, c.name);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      best = c;
      bestIdx = idx;
    }
  }
  
  return best ? { match: best, score: bestScore, idx: bestIdx } : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { italoProducts = [], marconProducts = [], alfaProducts = [] } = await req.json();
    console.log(`Comparing: Italo(${italoProducts.length}), Marcon(${marconProducts.length}), Alfa(${alfaProducts.length})\n`);

    // Index by GTIN
    const italoByGtin = new Map<string, ProductWithGtin>();
    const italoNoGtin: ProductWithGtin[] = [];
    for (const p of italoProducts) {
      const g = normalizeGtin(p.gtin);
      if (g) italoByGtin.set(g, p);
      else italoNoGtin.push(p);
    }

    const marconByGtin = new Map<string, ProductWithGtin>();
    const marconNoGtin: ProductWithGtin[] = [];
    for (const p of marconProducts) {
      const g = normalizeGtin(p.gtin);
      if (g) marconByGtin.set(g, p);
      else marconNoGtin.push(p);
    }

    const alfaByGtin = new Map<string, ProductWithGtin>();
    const alfaNoGtin: ProductWithGtin[] = [];
    for (const p of alfaProducts) {
      const g = normalizeGtin(p.gtin);
      if (g) alfaByGtin.set(g, p);
      else alfaNoGtin.push(p);
    }

    const comparedProducts: ComparedProduct[] = [];
    const matchedGtins = new Set<string>();
    
    // Stage 1: GTIN matching
    const allGtins = new Set([...italoByGtin.keys(), ...marconByGtin.keys(), ...alfaByGtin.keys()]);

    for (const gtin of allGtins) {
      const ip = italoByGtin.get(gtin);
      const mp = marconByGtin.get(gtin);
      const ap = alfaByGtin.get(gtin);
      
      const available = [ip, mp, ap].filter(Boolean);
      if (available.length < 2) continue;
      
      const prices: { store: string; price: number }[] = [];
      const iprice = ip ? extractPrice(ip) : null;
      const mprice = mp ? extractPrice(mp) : null;
      const aprice = ap ? extractPrice(ap) : null;
      
      if (iprice) prices.push({ store: 'italo', price: iprice });
      if (mprice) prices.push({ store: 'marcon', price: mprice });
      if (aprice) prices.push({ store: 'alfa', price: aprice });
      
      if (prices.length < 2) continue;
      
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      comparedProducts.push({
        gtin,
        name: ip?.name || mp?.name || ap?.name || '',
        italo: iprice ? { price: iprice } : undefined,
        marcon: mprice ? { price: mprice } : undefined,
        alfa: aprice ? { price: aprice } : undefined,
        bestStore: sorted[0].store,
        bestPrice: sorted[0].price,
        worstStore: sorted[sorted.length - 1].store,
        worstPrice: sorted[sorted.length - 1].price,
        stores: prices.map(p => p.store),
        matchType: 'gtin'
      });
      matchedGtins.add(gtin);
    }
    
    console.log(`GTIN matches: ${comparedProducts.length}\n`);

    // Stage 2: Description matching using token index (optimized)
    const unmatchedMarcon = [...marconByGtin.entries()]
      .filter(([g]) => !matchedGtins.has(g))
      .map(([_, p]) => p)
      .concat(marconNoGtin);
    
    const unmatchedAlfa = [...alfaByGtin.entries()]
      .filter(([g]) => !matchedGtins.has(g))
      .map(([_, p]) => p)
      .concat(alfaNoGtin);

    console.log(`Unmatched: Marcon(${unmatchedMarcon.length}), Alfa(${unmatchedAlfa.length})\n`);

    // Build token indices for faster lookup
    const marconIndex = buildTokenIndex(unmatchedMarcon);
    const alfaIndex = buildTokenIndex(unmatchedAlfa);
    
    let descMatches = 0;
    const processedMarcon = new Set<number>();
    const processedAlfa = new Set<number>();

    // Match Marcon vs Alfa only (skip Italo for description matching since it has 0 products in this case)
    for (let mi = 0; mi < unmatchedMarcon.length; mi++) {
      if (processedMarcon.has(mi)) continue;
      
      const mp = unmatchedMarcon[mi];
      const alfaCandidates = findCandidates(mp, unmatchedAlfa, alfaIndex);
      const am = findBestMatchOptimized(mp, alfaCandidates, unmatchedAlfa);
      
      if (!am || processedAlfa.has(am.idx)) continue;
      
      const prices: { store: string; price: number }[] = [];
      const mprice = extractPrice(mp);
      const aprice = extractPrice(am.match);
      
      if (mprice) prices.push({ store: 'marcon', price: mprice });
      if (aprice) prices.push({ store: 'alfa', price: aprice });
      
      if (prices.length < 2) continue;
      
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      const gtin = normalizeGtin(mp.gtin) || normalizeGtin(am.match.gtin) || `DESC-${descMatches}`;
      
      comparedProducts.push({
        gtin,
        name: mp.name,
        italo: undefined,
        marcon: mprice ? { price: mprice } : undefined,
        alfa: aprice ? { price: aprice } : undefined,
        bestStore: sorted[0].store,
        bestPrice: sorted[0].price,
        worstStore: sorted[sorted.length - 1].store,
        worstPrice: sorted[sorted.length - 1].price,
        stores: prices.map(p => p.store),
        matchType: 'description'
      });
      
      processedMarcon.add(mi);
      processedAlfa.add(am.idx);
      descMatches++;
      
      // Log progress every 500 matches
      if (descMatches % 500 === 0) {
        console.log(`Description matches progress: ${descMatches}\n`);
      }
    }
    
    console.log(`Description matches: ${descMatches}\n`);
    
    comparedProducts.sort((a, b) => a.name.localeCompare(b.name));
    
    const gtinCount = comparedProducts.filter(p => p.matchType === 'gtin').length;
    const stats = {
      totalMatches: comparedProducts.length,
      gtinMatches: gtinCount,
      descriptionMatches: descMatches,
      italoBest: comparedProducts.filter(p => p.bestStore === 'italo').length,
      marconBest: comparedProducts.filter(p => p.bestStore === 'marcon').length,
      alfaBest: comparedProducts.filter(p => p.bestStore === 'alfa').length
    };
    
    console.log(`Complete: ${stats.totalMatches} matches (${stats.gtinMatches} GTIN + ${stats.descriptionMatches} desc)\n`);
    
    return new Response(JSON.stringify({ success: true, comparedProducts, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
