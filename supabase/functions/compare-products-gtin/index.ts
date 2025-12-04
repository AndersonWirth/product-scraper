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
  matchType: 'gtin' | 'description' | 'semantic';
  matchScore?: number;
}

interface UnmatchedProduct {
  gtin?: string;
  name: string;
  price: number | null;
  store: string;
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
  if (g === '0' || g.length < 8) return '';
  return g;
}

// Extract quantity/volume from product name (e.g., "200ml", "1.5l", "500g", "1kg")
function extractQuantity(name: string): { value: number; unit: string } | null {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(',', '.');
  
  // Match patterns like: 200ml, 1.5l, 500g, 1kg, 2lt, 350 ml, 1,5 l
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(ml|l|lt|litro|litros)/i,
    /(\d+(?:\.\d+)?)\s*(kg|g|gr|gramas)/i,
    /(\d+(?:\.\d+)?)\s*(un|und|unid|unidades)/i,
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      let value = parseFloat(match[1]);
      let unit = match[2].toLowerCase();
      
      // Normalize units
      if (unit === 'l' || unit === 'lt' || unit === 'litro' || unit === 'litros') {
        value = value * 1000; // Convert to ml
        unit = 'ml';
      }
      if (unit === 'kg') {
        value = value * 1000; // Convert to g
        unit = 'g';
      }
      if (unit === 'gr' || unit === 'gramas') {
        unit = 'g';
      }
      if (unit === 'und' || unit === 'unid' || unit === 'unidades') {
        unit = 'un';
      }
      
      return { value, unit };
    }
  }
  return null;
}

// Check if quantities are compatible (same unit and similar value)
function quantitiesMatch(q1: { value: number; unit: string } | null, q2: { value: number; unit: string } | null): boolean {
  // If neither has quantity, they can match
  if (!q1 && !q2) return true;
  // If only one has quantity, they don't match
  if (!q1 || !q2) return false;
  // Must be same unit
  if (q1.unit !== q2.unit) return false;
  // Allow 10% tolerance for similar quantities
  const tolerance = Math.max(q1.value, q2.value) * 0.1;
  return Math.abs(q1.value - q2.value) <= tolerance;
}

function normalizeDescription(str: string): string {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(kg|g|gr|ml|l|lt|un|und|unid|pct|pc|cx|lata|garrafa|pet|pack|litro|litros|gramas)\b/gi, "")
    .replace(/\b(promocao|oferta|leve|pague|gratis|desconto|super|mega|hiper)\b/gi, "")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function getTokens(str: string): string[] {
  return normalizeDescription(str).split(' ').filter(t => t.length > 2);
}

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

function findCandidates(product: ProductWithGtin, tokenIndex: Map<string, Set<number>>, maxCandidates = 50): number[] {
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
  
  return [...candidateCounts.entries()]
    .filter(([_, count]) => count >= 2)
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
  
  const productQty = extractQuantity(product.name);
  
  for (const idx of candidates) {
    const c = targetProducts[idx];
    
    // Check quantity compatibility FIRST
    const candidateQty = extractQuantity(c.name);
    if (!quantitiesMatch(productQty, candidateQty)) {
      continue; // Skip if quantities don't match
    }
    
    const score = calculateSimilarity(product.name, c.name);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      best = c;
      bestIdx = idx;
    }
  }
  
  return best ? { match: best, score: bestScore, idx: bestIdx } : null;
}

// Gemini API for semantic matching
async function semanticMatch(
  products1: ProductWithGtin[], 
  products2: ProductWithGtin[],
  apiKey: string
): Promise<Map<number, { idx: number; score: number }>> {
  const matches = new Map<number, { idx: number; score: number }>();
  
  // Batch products for API calls (max 20 at a time to avoid timeout)
  const batchSize = 20;
  const batches = Math.ceil(Math.min(products1.length, 100) / batchSize); // Limit to 100 products for semantic
  
  for (let b = 0; b < batches; b++) {
    const start = b * batchSize;
    const end = Math.min(start + batchSize, products1.length, 100);
    const batch1 = products1.slice(start, end);
    
    const prompt = `Compare estes produtos do primeiro mercado com os do segundo mercado e retorne apenas os que são EXATAMENTE o mesmo produto (mesma marca, mesmo tamanho/gramagem, mesmo tipo). Responda APENAS em JSON.

Produtos Mercado 1:
${batch1.map((p, i) => `${start + i}: ${p.name}`).join('\n')}

Produtos Mercado 2:
${products2.slice(0, 100).map((p, i) => `${i}: ${p.name}`).join('\n')}

Retorne JSON: {"matches": [{"idx1": number, "idx2": number, "confidence": 0.0-1.0}]}
Só inclua matches com confidence >= 0.85. Se não houver matches, retorne {"matches": []}`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
          })
        }
      );
      
      if (!response.ok) {
        console.error('Gemini API error:', response.status);
        continue;
      }
      
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.matches && Array.isArray(parsed.matches)) {
          for (const m of parsed.matches) {
            if (m.idx1 !== undefined && m.idx2 !== undefined && m.confidence >= 0.85) {
              matches.set(m.idx1, { idx: m.idx2, score: m.confidence });
            }
          }
        }
      }
    } catch (e) {
      console.error('Semantic match error:', e);
    }
  }
  
  return matches;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { italoProducts = [], marconProducts = [], alfaProducts = [], useSemanticAI = false } = await req.json();
    console.log(`Comparing: Italo(${italoProducts.length}), Marcon(${marconProducts.length}), Alfa(${alfaProducts.length}), Semantic: ${useSemanticAI}\n`);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');

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

    // Stage 2: Description matching with quantity validation
    const unmatchedItalo = [...italoByGtin.entries()]
      .filter(([g]) => !matchedGtins.has(g))
      .map(([_, p]) => p)
      .concat(italoNoGtin);

    const unmatchedMarcon = [...marconByGtin.entries()]
      .filter(([g]) => !matchedGtins.has(g))
      .map(([_, p]) => p)
      .concat(marconNoGtin);
    
    const unmatchedAlfa = [...alfaByGtin.entries()]
      .filter(([g]) => !matchedGtins.has(g))
      .map(([_, p]) => p)
      .concat(alfaNoGtin);

    console.log(`Unmatched: Italo(${unmatchedItalo.length}), Marcon(${unmatchedMarcon.length}), Alfa(${unmatchedAlfa.length})\n`);

    // Build token indices
    const italoIndex = buildTokenIndex(unmatchedItalo);
    const marconIndex = buildTokenIndex(unmatchedMarcon);
    const alfaIndex = buildTokenIndex(unmatchedAlfa);
    
    let descMatches = 0;
    const processedItalo = new Set<number>();
    const processedMarcon = new Set<number>();
    const processedAlfa = new Set<number>();

    // Match all combinations
    // Marcon vs Alfa
    for (let mi = 0; mi < unmatchedMarcon.length; mi++) {
      if (processedMarcon.has(mi)) continue;
      
      const mp = unmatchedMarcon[mi];
      const alfaCandidates = findCandidates(mp, alfaIndex);
      const am = findBestMatchOptimized(mp, alfaCandidates, unmatchedAlfa);
      
      if (!am || processedAlfa.has(am.idx)) continue;
      
      // Also try to find Italo match
      const italoCandidates = findCandidates(mp, italoIndex);
      const im = findBestMatchOptimized(mp, italoCandidates, unmatchedItalo);
      
      const prices: { store: string; price: number }[] = [];
      const mprice = extractPrice(mp);
      const aprice = extractPrice(am.match);
      const iprice = im && !processedItalo.has(im.idx) ? extractPrice(im.match) : null;
      
      if (mprice) prices.push({ store: 'marcon', price: mprice });
      if (aprice) prices.push({ store: 'alfa', price: aprice });
      if (iprice) prices.push({ store: 'italo', price: iprice });
      
      if (prices.length < 2) continue;
      
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      const gtin = normalizeGtin(mp.gtin) || normalizeGtin(am.match.gtin) || (im ? normalizeGtin(im.match.gtin) : '') || `DESC-${descMatches}`;
      
      comparedProducts.push({
        gtin,
        name: mp.name,
        italo: iprice ? { price: iprice } : undefined,
        marcon: mprice ? { price: mprice } : undefined,
        alfa: aprice ? { price: aprice } : undefined,
        bestStore: sorted[0].store,
        bestPrice: sorted[0].price,
        worstStore: sorted[sorted.length - 1].store,
        worstPrice: sorted[sorted.length - 1].price,
        stores: prices.map(p => p.store),
        matchType: 'description',
        matchScore: am.score
      });
      
      processedMarcon.add(mi);
      processedAlfa.add(am.idx);
      if (im) processedItalo.add(im.idx);
      descMatches++;
    }

    // Italo vs remaining Marcon
    for (let ii = 0; ii < unmatchedItalo.length; ii++) {
      if (processedItalo.has(ii)) continue;
      
      const ip = unmatchedItalo[ii];
      const marconCandidates = findCandidates(ip, marconIndex);
      const mm = findBestMatchOptimized(ip, marconCandidates, unmatchedMarcon.filter((_, idx) => !processedMarcon.has(idx)));
      
      if (!mm) continue;
      
      const prices: { store: string; price: number }[] = [];
      const iprice = extractPrice(ip);
      const mprice = extractPrice(mm.match);
      
      if (iprice) prices.push({ store: 'italo', price: iprice });
      if (mprice) prices.push({ store: 'marcon', price: mprice });
      
      if (prices.length < 2) continue;
      
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      const gtin = normalizeGtin(ip.gtin) || normalizeGtin(mm.match.gtin) || `DESC-${descMatches}`;
      
      comparedProducts.push({
        gtin,
        name: ip.name,
        italo: iprice ? { price: iprice } : undefined,
        marcon: mprice ? { price: mprice } : undefined,
        alfa: undefined,
        bestStore: sorted[0].store,
        bestPrice: sorted[0].price,
        worstStore: sorted[sorted.length - 1].store,
        worstPrice: sorted[sorted.length - 1].price,
        stores: prices.map(p => p.store),
        matchType: 'description',
        matchScore: mm.score
      });
      
      processedItalo.add(ii);
      descMatches++;
    }
    
    console.log(`Description matches: ${descMatches}\n`);

    // Stage 3: Semantic AI matching (if enabled and API key available)
    let semanticMatches = 0;
    if (useSemanticAI && geminiKey) {
      console.log('Starting semantic matching with Gemini...\n');
      
      const remainingMarcon = unmatchedMarcon.filter((_, i) => !processedMarcon.has(i));
      const remainingAlfa = unmatchedAlfa.filter((_, i) => !processedAlfa.has(i));
      
      if (remainingMarcon.length > 0 && remainingAlfa.length > 0) {
        const semanticResults = await semanticMatch(remainingMarcon, remainingAlfa, geminiKey);
        
        for (const [idx1, { idx: idx2, score }] of semanticResults) {
          const mp = remainingMarcon[idx1];
          const ap = remainingAlfa[idx2];
          
          const prices: { store: string; price: number }[] = [];
          const mprice = extractPrice(mp);
          const aprice = extractPrice(ap);
          
          if (mprice) prices.push({ store: 'marcon', price: mprice });
          if (aprice) prices.push({ store: 'alfa', price: aprice });
          
          if (prices.length < 2) continue;
          
          const sorted = [...prices].sort((a, b) => a.price - b.price);
          const gtin = normalizeGtin(mp.gtin) || normalizeGtin(ap.gtin) || `SEM-${semanticMatches}`;
          
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
            matchType: 'semantic',
            matchScore: score
          });
          
          semanticMatches++;
        }
      }
      
      console.log(`Semantic matches: ${semanticMatches}\n`);
    }

    // Collect unmatched products
    const unmatchedProducts: UnmatchedProduct[] = [];
    
    for (let i = 0; i < unmatchedItalo.length; i++) {
      if (!processedItalo.has(i)) {
        const p = unmatchedItalo[i];
        unmatchedProducts.push({
          gtin: normalizeGtin(p.gtin) || undefined,
          name: p.name,
          price: extractPrice(p),
          store: 'italo'
        });
      }
    }
    
    for (let i = 0; i < unmatchedMarcon.length; i++) {
      if (!processedMarcon.has(i)) {
        const p = unmatchedMarcon[i];
        unmatchedProducts.push({
          gtin: normalizeGtin(p.gtin) || undefined,
          name: p.name,
          price: extractPrice(p),
          store: 'marcon'
        });
      }
    }
    
    for (let i = 0; i < unmatchedAlfa.length; i++) {
      if (!processedAlfa.has(i)) {
        const p = unmatchedAlfa[i];
        unmatchedProducts.push({
          gtin: normalizeGtin(p.gtin) || undefined,
          name: p.name,
          price: extractPrice(p),
          store: 'alfa'
        });
      }
    }
    
    comparedProducts.sort((a, b) => a.name.localeCompare(b.name));
    
    const gtinCount = comparedProducts.filter(p => p.matchType === 'gtin').length;
    const descCount = comparedProducts.filter(p => p.matchType === 'description').length;
    const semCount = comparedProducts.filter(p => p.matchType === 'semantic').length;
    
    const stats = {
      totalMatches: comparedProducts.length,
      gtinMatches: gtinCount,
      descriptionMatches: descCount,
      semanticMatches: semCount,
      unmatchedCount: unmatchedProducts.length,
      italoBest: comparedProducts.filter(p => p.bestStore === 'italo').length,
      marconBest: comparedProducts.filter(p => p.bestStore === 'marcon').length,
      alfaBest: comparedProducts.filter(p => p.bestStore === 'alfa').length
    };
    
    console.log(`Complete: ${stats.totalMatches} matches (${stats.gtinMatches} GTIN + ${stats.descriptionMatches} desc + ${stats.semanticMatches} sem), ${stats.unmatchedCount} unmatched\n`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      comparedProducts, 
      unmatchedProducts,
      stats 
    }), {
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
