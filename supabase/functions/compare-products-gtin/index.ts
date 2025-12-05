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

const SYNONYMS: Record<string, string[]> = {
  'chiclete': ['goma', 'goma de mascar', 'chicle'],
  'goma': ['chiclete', 'goma de mascar', 'chicle'],
  'refrigerante': ['refri', 'bebida gaseificada'],
  'bolacha': ['biscoito'],
  'biscoito': ['bolacha'],
  'achocolatado': ['chocolate em po', 'nescau', 'toddy'],
  'leite condensado': ['leite mococa', 'mococa'],
  'margarina': ['manteiga vegetal'],
  'macarrao': ['massa', 'espaguete', 'talharim'],
  'massa': ['macarrao'],
  'sabao': ['detergente', 'lava loucas'],
  'amaciante': ['amaciante de roupas'],
  'desodorante': ['antitranspirante', 'deo'],
  'shampoo': ['xampu'],
  'condicionador': ['creme rinse'],
  'papel higienico': ['papel sanitario'],
  'fralda': ['fralda descartavel'],
  'cerveja': ['cerva', 'breja'],
  'cafe': ['cafe em po', 'cafe torrado'],
  'arroz': ['arroz branco', 'arroz tipo 1'],
  'feijao': ['feijao carioca', 'feijao preto'],
  'oleo': ['oleo de soja', 'oleo vegetal'],
  'acucar': ['acucar refinado', 'acucar cristal'],
  'sal': ['sal refinado', 'sal marinho'],
  'farinha': ['farinha de trigo'],
  'leite': ['leite integral', 'leite uht'],
  'iogurte': ['yogurt', 'yogurte'],
  'queijo': ['queijo mussarela', 'mucarela'],
  'presunto': ['apresuntado'],
  'mortadela': ['embutido'],
  'linguica': ['salsicha'],
  'salsicha': ['linguica'],
  'frango': ['frango congelado', 'ave'],
  'carne': ['carne bovina', 'carne moida'],
  'peixe': ['filé de peixe'],
  'batata': ['batatinha', 'batata inglesa'],
  'tomate': ['tomate maduro'],
  'cebola': ['cebola branca'],
  'alho': ['alho nacional'],
  'banana': ['banana nanica', 'banana prata'],
  'maca': ['maca fuji', 'maca gala'],
  'laranja': ['laranja pera'],
  'limao': ['limao tahiti'],
  'agua': ['agua mineral'],
  'suco': ['suco de fruta', 'nectar'],
  'energetico': ['bebida energetica', 'energy drink'],
};

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

function extractQuantity(name: string): { value: number; unit: string } | null {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(',', '.');
  
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
      
      if (unit === 'l' || unit === 'lt' || unit === 'litro' || unit === 'litros') {
        value = value * 1000;
        unit = 'ml';
      }
      if (unit === 'kg') {
        value = value * 1000;
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

function quantitiesMatch(q1: { value: number; unit: string } | null, q2: { value: number; unit: string } | null): boolean {
  if (!q1 && !q2) return true;
  if (!q1 || !q2) return false;
  if (q1.unit !== q2.unit) return false;
  const tolerance = Math.max(q1.value, q2.value) * 0.15;
  return Math.abs(q1.value - q2.value) <= tolerance;
}

function normalizeDescription(str: string): string {
  if (!str) return '';
  return str.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(kg|g|gr|ml|l|lt|un|und|unid|pct|pc|cx|lata|garrafa|pet|pack|litro|litros|gramas)\b/gi, "")
    .replace(/\b(promocao|oferta|leve|pague|gratis|desconto|super|mega|hiper)\b/gi, "")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokensWithSynonyms(str: string): Set<string> {
  const base = normalizeDescription(str).split(' ').filter(t => t.length > 2);
  const expanded = new Set(base);
  
  for (const token of base) {
    for (const [key, synonyms] of Object.entries(SYNONYMS)) {
      if (token === key || synonyms.some(s => s.includes(token) || token.includes(s))) {
        expanded.add(key);
        synonyms.forEach(s => {
          s.split(' ').forEach(part => {
            if (part.length > 2) expanded.add(part);
          });
        });
      }
    }
  }
  
  return expanded;
}

function buildTokenIndex(products: ProductWithGtin[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (let i = 0; i < products.length; i++) {
    const tokens = getTokensWithSynonyms(products[i].name);
    for (const t of tokens) {
      if (!index.has(t)) index.set(t, new Set());
      index.get(t)!.add(i);
    }
  }
  return index;
}

function findCandidates(product: ProductWithGtin, tokenIndex: Map<string, Set<number>>, maxCandidates = 50): number[] {
  const tokens = getTokensWithSynonyms(product.name);
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
  const tokens1 = getTokensWithSynonyms(str1);
  const tokens2 = getTokensWithSynonyms(str2);
  
  if (!tokens1.size || !tokens2.size) return 0;
  
  let matches = 0;
  for (const t1 of tokens1) {
    if (tokens2.has(t1)) matches++;
  }
  
  return (matches * 2) / (tokens1.size + tokens2.size);
}

function findBestMatchOptimized(
  product: ProductWithGtin, 
  candidates: number[], 
  targetProducts: ProductWithGtin[], 
  threshold = 0.50
): { match: ProductWithGtin; score: number; idx: number } | null {
  let best: ProductWithGtin | null = null;
  let bestScore = 0;
  let bestIdx = -1;
  
  const productQty = extractQuantity(product.name);
  
  for (const idx of candidates) {
    const c = targetProducts[idx];
    const candidateQty = extractQuantity(c.name);
    if (!quantitiesMatch(productQty, candidateQty)) continue;
    
    const score = calculateSimilarity(product.name, c.name);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      best = c;
      bestIdx = idx;
    }
  }
  
  return best ? { match: best, score: bestScore, idx: bestIdx } : null;
}

async function semanticMatchBatch(
  products1: { idx: number; name: string }[],
  products2: { idx: number; name: string }[],
  apiKey: string
): Promise<{ idx1: number; idx2: number; score: number }[]> {
  const prompt = `Compare produtos. "Chiclete"="Goma", "Bolacha"="Biscoito".

Lista 1:
${products1.map(p => `[${p.idx}] ${p.name}`).join('\n')}

Lista 2:
${products2.map(p => `[${p.idx}] ${p.name}`).join('\n')}

JSON: {"matches":[{"idx1":0,"idx2":0,"score":0.95}]}
Score >= 0.85. Se vazio: {"matches":[]}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Retorne apenas JSON válido.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2048
      }),
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.matches && Array.isArray(parsed.matches)) {
        return parsed.matches.filter((m: any) => 
          m.idx1 !== undefined && m.idx2 !== undefined && m.score >= 0.85
        );
      }
    }
  } catch (e) {
    console.error('Semantic error:', e);
  }
  
  return [];
}

async function semanticMatchAll(
  unmatched1: ProductWithGtin[],
  unmatched2: ProductWithGtin[],
  apiKey: string
): Promise<Map<number, { idx: number; score: number }>> {
  const results = new Map<number, { idx: number; score: number }>();
  
  // Limitar para evitar timeout
  const limit1 = unmatched1.slice(0, 100);
  const limit2 = unmatched2.slice(0, 100);
  
  console.log(`Semantic: ${limit1.length} vs ${limit2.length}`);
  
  for (let i = 0; i < limit1.length; i += 15) {
    const batch1 = limit1.slice(i, i + 15).map((p, idx) => ({ idx: i + idx, name: p.name }));
    
    for (let j = 0; j < limit2.length; j += 30) {
      const batch2 = limit2.slice(j, j + 30).map((p, idx) => ({ idx: j + idx, name: p.name }));
      
      const matches = await semanticMatchBatch(batch1, batch2, apiKey);
      
      for (const m of matches) {
        const existing = results.get(m.idx1);
        if (!existing || m.score > existing.score) {
          results.set(m.idx1, { idx: m.idx2, score: m.score });
        }
      }
      
      await new Promise(r => setTimeout(r, 50));
    }
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const startTime = Date.now();
    const { 
      italoProducts = [], 
      marconProducts = [], 
      alfaProducts = [], 
      useSemanticAI = false
    } = await req.json();
    
    console.log(`Processing: Italo(${italoProducts.length}), Marcon(${marconProducts.length}), Alfa(${alfaProducts.length}), Semantic: ${useSemanticAI}`);

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    // Indexação
    const italoByGtin = new Map<string, ProductWithGtin>();
    const italoNoGtin: ProductWithGtin[] = [];
    italoProducts.forEach((p: ProductWithGtin) => {
      const g = normalizeGtin(p.gtin);
      g ? italoByGtin.set(g, p) : italoNoGtin.push(p);
    });

    const marconByGtin = new Map<string, ProductWithGtin>();
    const marconNoGtin: ProductWithGtin[] = [];
    marconProducts.forEach((p: ProductWithGtin) => {
      const g = normalizeGtin(p.gtin);
      g ? marconByGtin.set(g, p) : marconNoGtin.push(p);
    });

    const alfaByGtin = new Map<string, ProductWithGtin>();
    const alfaNoGtin: ProductWithGtin[] = [];
    alfaProducts.forEach((p: ProductWithGtin) => {
      const g = normalizeGtin(p.gtin);
      g ? alfaByGtin.set(g, p) : alfaNoGtin.push(p);
    });

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
    
    console.log(`GTIN matches: ${comparedProducts.length}`);

    // Stage 2: Description matching
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

    const marconIndex = buildTokenIndex(unmatchedMarcon);
    const alfaIndex = buildTokenIndex(unmatchedAlfa);
    const italoIndex = buildTokenIndex(unmatchedItalo);
    
    let descMatches = 0;
    const processedMarcon = new Set<number>();
    const processedAlfa = new Set<number>();
    const processedItalo = new Set<number>();

    // Marcon vs Alfa
    for (let mi = 0; mi < unmatchedMarcon.length; mi++) {
      if (processedMarcon.has(mi)) continue;
      
      const mp = unmatchedMarcon[mi];
      const alfaCandidates = findCandidates(mp, alfaIndex);
      const am = findBestMatchOptimized(mp, alfaCandidates, unmatchedAlfa);
      
      if (!am || processedAlfa.has(am.idx)) continue;
      
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

    // Italo vs remaining
    for (let ii = 0; ii < unmatchedItalo.length; ii++) {
      if (processedItalo.has(ii)) continue;
      
      const ip = unmatchedItalo[ii];
      
      const marconCandidates = findCandidates(ip, marconIndex);
      const filteredMarconCandidates = marconCandidates.filter(idx => !processedMarcon.has(idx));
      const mm = findBestMatchOptimized(ip, filteredMarconCandidates, unmatchedMarcon);
      
      const alfaCandidates = findCandidates(ip, alfaIndex);
      const filteredAlfaCandidates = alfaCandidates.filter(idx => !processedAlfa.has(idx));
      const am = findBestMatchOptimized(ip, filteredAlfaCandidates, unmatchedAlfa);
      
      if (!mm && !am) continue;
      
      const prices: { store: string; price: number }[] = [];
      const iprice = extractPrice(ip);
      const mprice = mm ? extractPrice(mm.match) : null;
      const aprice = am ? extractPrice(am.match) : null;
      
      if (iprice) prices.push({ store: 'italo', price: iprice });
      if (mprice) prices.push({ store: 'marcon', price: mprice });
      if (aprice) prices.push({ store: 'alfa', price: aprice });
      
      if (prices.length < 2) continue;
      
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      const gtin = normalizeGtin(ip.gtin) || (mm ? normalizeGtin(mm.match.gtin) : '') || (am ? normalizeGtin(am.match.gtin) : '') || `DESC-${descMatches}`;
      
      comparedProducts.push({
        gtin,
        name: ip.name,
        italo: iprice ? { price: iprice } : undefined,
        marcon: mprice ? { price: mprice } : undefined,
        alfa: aprice ? { price: aprice } : undefined,
        bestStore: sorted[0].store,
        bestPrice: sorted[0].price,
        worstStore: sorted[sorted.length - 1].store,
        worstPrice: sorted[sorted.length - 1].price,
        stores: prices.map(p => p.store),
        matchType: 'description',
        matchScore: Math.max(mm?.score || 0, am?.score || 0)
      });
      
      processedItalo.add(ii);
      if (mm) processedMarcon.add(mm.idx);
      if (am) processedAlfa.add(am.idx);
      descMatches++;
    }
    
    console.log(`Description matches: ${descMatches}`);

    // Stage 3: Semantic AI matching
    let semanticMatches = 0;
    if (useSemanticAI && lovableKey) {
      console.log('Stage 3: Semantic matching');
      
      const remainingMarcon = unmatchedMarcon.filter((_, i) => !processedMarcon.has(i));
      const remainingAlfa = unmatchedAlfa.filter((_, i) => !processedAlfa.has(i));
      
      if (remainingMarcon.length > 0 && remainingAlfa.length > 0) {
        const semanticResults = await semanticMatchAll(remainingMarcon, remainingAlfa, lovableKey);
        
        const semanticProcessedMarcon = new Set<number>();
        const semanticProcessedAlfa = new Set<number>();
        
        for (const [marconIdx, { idx: alfaIdx, score }] of semanticResults) {
          if (semanticProcessedMarcon.has(marconIdx) || semanticProcessedAlfa.has(alfaIdx)) continue;
          
          const mp = remainingMarcon[marconIdx];
          const ap = remainingAlfa[alfaIdx];
          
          if (!mp || !ap) continue;
          
          const mqty = extractQuantity(mp.name);
          const aqty = extractQuantity(ap.name);
          if (!quantitiesMatch(mqty, aqty)) continue;
          
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
          
          semanticProcessedMarcon.add(marconIdx);
          semanticProcessedAlfa.add(alfaIdx);
          semanticMatches++;
        }
      }
      
      console.log(`Semantic matches: ${semanticMatches}`);
    }

    // Collect unmatched
    const unmatchedProducts: UnmatchedProduct[] = [];
    
    unmatchedMarcon.forEach((p, i) => {
      if (!processedMarcon.has(i)) {
        unmatchedProducts.push({ gtin: normalizeGtin(p.gtin) || undefined, name: p.name, price: extractPrice(p), store: 'marcon' });
      }
    });
    
    unmatchedAlfa.forEach((p, i) => {
      if (!processedAlfa.has(i)) {
        unmatchedProducts.push({ gtin: normalizeGtin(p.gtin) || undefined, name: p.name, price: extractPrice(p), store: 'alfa' });
      }
    });
    
    unmatchedItalo.forEach((p, i) => {
      if (!processedItalo.has(i)) {
        unmatchedProducts.push({ gtin: normalizeGtin(p.gtin) || undefined, name: p.name, price: extractPrice(p), store: 'italo' });
      }
    });

    const stats = {
      totalMatches: comparedProducts.length,
      gtinMatches: comparedProducts.filter(p => p.matchType === 'gtin').length,
      descriptionMatches: comparedProducts.filter(p => p.matchType === 'description').length,
      semanticMatches: comparedProducts.filter(p => p.matchType === 'semantic').length,
      unmatchedCount: unmatchedProducts.length,
      italoBest: comparedProducts.filter(p => p.bestStore === 'italo').length,
      marconBest: comparedProducts.filter(p => p.bestStore === 'marcon').length,
      alfaBest: comparedProducts.filter(p => p.bestStore === 'alfa').length,
      processingTime: Date.now() - startTime
    };

    console.log(`Final: ${JSON.stringify(stats)}`);

    return new Response(JSON.stringify({ comparedProducts, unmatchedProducts, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Compare error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
