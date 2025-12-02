import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Product {
  gtin?: string;
  name: string;
  price?: number | string;
  special?: string;
  pricing?: {
    price: number;
    promotionalPrice?: number;
  };
  promotionalPrice?: number | string;
  store: string;
  [key: string]: any;
}

interface MatchedGroup {
  product_uid: string;
  name: string;
  gtin?: string;
  matchType: 'gtin' | 'fuzzy' | 'semantic' | 'combined';
  matchScore: number;
  italo?: { price: number; name: string; gtin?: string };
  marcon?: { price: number; name: string; gtin?: string };
  alfa?: { price: number; name: string; gtin?: string };
  bestStore: string;
  bestPrice: number;
  worstStore: string;
  worstPrice: number;
  stores: string[];
}

// ============= ETAPA 2: Normalização de Descrições =============
function normalize(str: string): string {
  if (!str) return '';
  
  return str
    .toLowerCase()
    // Remove acentos
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remove símbolos especiais
    .replace(/[^\w\s]/g, " ")
    // Remove unidades de medida
    .replace(/\b(\d+)\s*(g|gr|grs|gramas|kg|kgs|quilos|ml|l|lt|lts|litros|un|und|unid|unidades|pct|pacote|cx|caixa)\b/gi, " ")
    // Remove palavras irrelevantes
    .replace(/\b(promocao|promo|oferta|leve|pague|gratis|novo|exclusivo|especial|super|mega|ultra|premium|gold|plus|extra)\b/gi, " ")
    // Padroniza espaços
    .replace(/\s+/g, " ")
    .trim();
}

// ============= ETAPA 3: Similaridade Textual =============

// Levenshtein Distance
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return (maxLen - levenshteinDistance(a, b)) / maxLen;
}

// Token Sort Ratio - compara tokens ordenados
function tokenSortRatio(a: string, b: string): number {
  const tokensA = a.split(' ').filter(t => t.length > 0).sort().join(' ');
  const tokensB = b.split(' ').filter(t => t.length > 0).sort().join(' ');
  return levenshteinSimilarity(tokensA, tokensB);
}

// Partial Ratio - melhor match de substring
function partialRatio(shorter: string, longer: string): number {
  if (shorter.length > longer.length) {
    [shorter, longer] = [longer, shorter];
  }
  
  if (shorter.length === 0) return 0;
  
  let bestScore = 0;
  for (let i = 0; i <= longer.length - shorter.length; i++) {
    const substring = longer.substring(i, i + shorter.length);
    const score = levenshteinSimilarity(shorter, substring);
    if (score > bestScore) {
      bestScore = score;
    }
  }
  
  return bestScore;
}

// Jaro-Winkler Similarity
function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0;
  
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  
  // Winkler modification
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  
  return jaro + prefix * 0.1 * (1 - jaro);
}

// Score Composto de Fuzzy
function calculateFuzzyScore(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  
  const levenshtein = levenshteinSimilarity(normA, normB) * 100;
  const tokenSort = tokenSortRatio(normA, normB) * 100;
  const partial = partialRatio(normA, normB) * 100;
  const jaroWinkler = jaroWinklerSimilarity(normA, normB) * 100;
  
  // Pesos: Token Sort (35%), Jaro-Winkler (30%), Partial (20%), Levenshtein (15%)
  return (tokenSort * 0.35) + (jaroWinkler * 0.30) + (partial * 0.20) + (levenshtein * 0.15);
}

// ============= ETAPA 4: Similaridade Semântica via Lovable AI =============
async function getEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // Processa em batches para evitar rate limits
  const batchSize = 10;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente que gera vetores de embedding para comparação de similaridade de produtos de supermercado. 
Para cada produto, retorne um vetor numérico de 8 dimensões representando características semânticas do produto.
Responda APENAS com um JSON array de arrays de números, sem texto adicional.
Exemplo: [[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]]`
          },
          {
            role: "user",
            content: `Gere embeddings para estes produtos:\n${batch.map((t, idx) => `${idx + 1}. ${t}`).join('\n')}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Embedding API error: ${response.status}`);
      // Retorna embeddings vazios em caso de erro
      batch.forEach(() => embeddings.push([]));
      continue;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    try {
      // Extrai JSON do response
      const jsonMatch = content.match(/\[\s*\[[\d\s,.\-]+\](?:\s*,\s*\[[\d\s,.\-]+\])*\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsed.forEach((emb: number[]) => embeddings.push(emb));
      } else {
        batch.forEach(() => embeddings.push([]));
      }
    } catch (e) {
      console.error('Failed to parse embeddings:', e);
      batch.forEach(() => embeddings.push([]));
    }
    
    // Pequeno delay entre batches
    if (i + batchSize < texts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  return embeddings;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============= Extração de Preço =============
function extractPrice(product: Product): number | null {
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
  return gtin.toString().trim().replace(/^0+/, '');
}

function generateUID(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { italoProducts, marconProducts, alfaProducts, useSemanticAI } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    console.log(`Starting advanced comparison:`);
    console.log(`- Italo: ${italoProducts?.length || 0} products`);
    console.log(`- Marcon: ${marconProducts?.length || 0} products`);
    console.log(`- Alfa: ${alfaProducts?.length || 0} products`);
    console.log(`- Semantic AI: ${useSemanticAI ? 'enabled' : 'disabled'}`);

    // Indexa produtos por GTIN para busca eficiente
    const marconByGtin = new Map<string, Product>();
    const alfaByGtin = new Map<string, Product>();
    
    (marconProducts || []).forEach((p: Product) => {
      const gtin = normalizeGtin(p.gtin);
      if (gtin) marconByGtin.set(gtin, { ...p, store: 'marcon' });
    });
    
    (alfaProducts || []).forEach((p: Product) => {
      const gtin = normalizeGtin(p.gtin);
      if (gtin) alfaByGtin.set(gtin, { ...p, store: 'alfa' });
    });

    const matchedGroups: MatchedGroup[] = [];
    const processedGtins = new Set<string>();
    const unmatchedItalo: Product[] = [];
    
    // ============= ETAPA 1: Match por GTIN =============
    console.log('Stage 1: GTIN matching...');
    
    for (const italoProduct of (italoProducts || [])) {
      const gtin = normalizeGtin(italoProduct.gtin);
      
      if (gtin && !processedGtins.has(gtin)) {
        processedGtins.add(gtin);
        
        const marconProduct = marconByGtin.get(gtin);
        const alfaProduct = alfaByGtin.get(gtin);
        
        if (marconProduct || alfaProduct) {
          // Match exato por GTIN
          const italoPrice = extractPrice(italoProduct);
          const marconPrice = marconProduct ? extractPrice(marconProduct) : null;
          const alfaPrice = alfaProduct ? extractPrice(alfaProduct) : null;
          
          const prices: { store: string; price: number }[] = [];
          if (italoPrice) prices.push({ store: 'italo', price: italoPrice });
          if (marconPrice) prices.push({ store: 'marcon', price: marconPrice });
          if (alfaPrice) prices.push({ store: 'alfa', price: alfaPrice });
          
          if (prices.length > 0) {
            const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
            
            matchedGroups.push({
              product_uid: generateUID(),
              name: italoProduct.name,
              gtin,
              matchType: 'gtin',
              matchScore: 100,
              italo: italoPrice ? { price: italoPrice, name: italoProduct.name, gtin } : undefined,
              marcon: marconPrice ? { price: marconPrice, name: marconProduct!.name, gtin: marconProduct!.gtin } : undefined,
              alfa: alfaPrice ? { price: alfaPrice, name: alfaProduct!.name, gtin: alfaProduct!.gtin } : undefined,
              bestStore: sortedPrices[0].store,
              bestPrice: sortedPrices[0].price,
              worstStore: sortedPrices[sortedPrices.length - 1].store,
              worstPrice: sortedPrices[sortedPrices.length - 1].price,
              stores: prices.map(p => p.store),
            });
          }
        } else {
          unmatchedItalo.push({ ...italoProduct, store: 'italo' });
        }
      } else if (!gtin) {
        unmatchedItalo.push({ ...italoProduct, store: 'italo' });
      }
    }
    
    console.log(`GTIN matches: ${matchedGroups.length}`);
    console.log(`Unmatched Italo products: ${unmatchedItalo.length}`);

    // ============= ETAPA 3 & 4: Fuzzy + Semantic Matching =============
    if (unmatchedItalo.length > 0 && (marconProducts?.length > 0 || alfaProducts?.length > 0)) {
      console.log('Stage 2-4: Fuzzy + Semantic matching...');
      
      // Filtra produtos não usados nos matches de GTIN
      const availableMarcon = (marconProducts || []).filter((p: Product) => {
        const gtin = normalizeGtin(p.gtin);
        return !gtin || !processedGtins.has(gtin);
      });
      
      const availableAlfa = (alfaProducts || []).filter((p: Product) => {
        const gtin = normalizeGtin(p.gtin);
        return !gtin || !processedGtins.has(gtin);
      });
      
      // Prepara embeddings se IA semântica estiver habilitada
      let italoEmbeddings: number[][] = [];
      let marconEmbeddings: number[][] = [];
      let alfaEmbeddings: number[][] = [];
      
      if (useSemanticAI && LOVABLE_API_KEY) {
        console.log('Generating semantic embeddings...');
        
        const italoTexts = unmatchedItalo.slice(0, 100).map(p => p.name);
        const marconTexts = availableMarcon.slice(0, 200).map((p: Product) => p.name);
        const alfaTexts = availableAlfa.slice(0, 200).map((p: Product) => p.name);
        
        [italoEmbeddings, marconEmbeddings, alfaEmbeddings] = await Promise.all([
          getEmbeddings(italoTexts, LOVABLE_API_KEY),
          getEmbeddings(marconTexts, LOVABLE_API_KEY),
          getEmbeddings(alfaTexts, LOVABLE_API_KEY),
        ]);
        
        console.log(`Embeddings generated: Italo(${italoEmbeddings.length}), Marcon(${marconEmbeddings.length}), Alfa(${alfaEmbeddings.length})`);
      }
      
      // Processa cada produto não matchado do Italo
      for (let i = 0; i < Math.min(unmatchedItalo.length, 100); i++) {
        const italoProduct = unmatchedItalo[i];
        const italoEmb = italoEmbeddings[i] || [];
        
        let bestMarconMatch: { product: Product; fuzzyScore: number; semanticScore: number } | null = null;
        let bestAlfaMatch: { product: Product; fuzzyScore: number; semanticScore: number } | null = null;
        
        // Busca melhor match no Marcon
        for (let j = 0; j < Math.min(availableMarcon.length, 200); j++) {
          const marconProduct = availableMarcon[j];
          const fuzzyScore = calculateFuzzyScore(italoProduct.name, marconProduct.name);
          let semanticScore = 0;
          
          if (italoEmb.length > 0 && marconEmbeddings[j]?.length > 0) {
            semanticScore = cosineSimilarity(italoEmb, marconEmbeddings[j]) * 100;
          }
          
          if (fuzzyScore > 70 || semanticScore > 75) {
            if (!bestMarconMatch || (fuzzyScore + semanticScore) > (bestMarconMatch.fuzzyScore + bestMarconMatch.semanticScore)) {
              bestMarconMatch = { product: marconProduct, fuzzyScore, semanticScore };
            }
          }
        }
        
        // Busca melhor match no Alfa
        for (let j = 0; j < Math.min(availableAlfa.length, 200); j++) {
          const alfaProduct = availableAlfa[j];
          const fuzzyScore = calculateFuzzyScore(italoProduct.name, alfaProduct.name);
          let semanticScore = 0;
          
          if (italoEmb.length > 0 && alfaEmbeddings[j]?.length > 0) {
            semanticScore = cosineSimilarity(italoEmb, alfaEmbeddings[j]) * 100;
          }
          
          if (fuzzyScore > 70 || semanticScore > 75) {
            if (!bestAlfaMatch || (fuzzyScore + semanticScore) > (bestAlfaMatch.fuzzyScore + bestAlfaMatch.semanticScore)) {
              bestAlfaMatch = { product: alfaProduct, fuzzyScore, semanticScore };
            }
          }
        }
        
        // Cria grupo se houver pelo menos um match
        if (bestMarconMatch || bestAlfaMatch) {
          const italoPrice = extractPrice(italoProduct);
          const marconPrice = bestMarconMatch ? extractPrice(bestMarconMatch.product) : null;
          const alfaPrice = bestAlfaMatch ? extractPrice(bestAlfaMatch.product) : null;
          
          const prices: { store: string; price: number }[] = [];
          if (italoPrice) prices.push({ store: 'italo', price: italoPrice });
          if (marconPrice) prices.push({ store: 'marcon', price: marconPrice });
          if (alfaPrice) prices.push({ store: 'alfa', price: alfaPrice });
          
          if (prices.length > 1) {
            const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
            
            // Determina tipo e score do match
            const hasSemanticMatch = (bestMarconMatch?.semanticScore || 0) > 75 || (bestAlfaMatch?.semanticScore || 0) > 75;
            const hasFuzzyMatch = (bestMarconMatch?.fuzzyScore || 0) > 70 || (bestAlfaMatch?.fuzzyScore || 0) > 70;
            
            let matchType: 'fuzzy' | 'semantic' | 'combined' = 'fuzzy';
            if (hasSemanticMatch && hasFuzzyMatch) matchType = 'combined';
            else if (hasSemanticMatch) matchType = 'semantic';
            
            const maxScore = Math.max(
              bestMarconMatch?.fuzzyScore || 0,
              bestAlfaMatch?.fuzzyScore || 0,
              bestMarconMatch?.semanticScore || 0,
              bestAlfaMatch?.semanticScore || 0
            );
            
            matchedGroups.push({
              product_uid: generateUID(),
              name: italoProduct.name,
              matchType,
              matchScore: Math.round(maxScore),
              italo: italoPrice ? { price: italoPrice, name: italoProduct.name, gtin: italoProduct.gtin } : undefined,
              marcon: marconPrice && bestMarconMatch ? { 
                price: marconPrice, 
                name: bestMarconMatch.product.name, 
                gtin: bestMarconMatch.product.gtin 
              } : undefined,
              alfa: alfaPrice && bestAlfaMatch ? { 
                price: alfaPrice, 
                name: bestAlfaMatch.product.name, 
                gtin: bestAlfaMatch.product.gtin 
              } : undefined,
              bestStore: sortedPrices[0].store,
              bestPrice: sortedPrices[0].price,
              worstStore: sortedPrices[sortedPrices.length - 1].store,
              worstPrice: sortedPrices[sortedPrices.length - 1].price,
              stores: prices.map(p => p.store),
            });
          }
        }
      }
    }

    // Ordena por tipo de match (GTIN primeiro, depois por score)
    matchedGroups.sort((a, b) => {
      if (a.matchType === 'gtin' && b.matchType !== 'gtin') return -1;
      if (a.matchType !== 'gtin' && b.matchType === 'gtin') return 1;
      return b.matchScore - a.matchScore;
    });

    const stats = {
      totalMatches: matchedGroups.length,
      gtinMatches: matchedGroups.filter(m => m.matchType === 'gtin').length,
      fuzzyMatches: matchedGroups.filter(m => m.matchType === 'fuzzy').length,
      semanticMatches: matchedGroups.filter(m => m.matchType === 'semantic').length,
      combinedMatches: matchedGroups.filter(m => m.matchType === 'combined').length,
      italoBest: matchedGroups.filter(p => p.bestStore === 'italo').length,
      marconBest: matchedGroups.filter(p => p.bestStore === 'marcon').length,
      alfaBest: matchedGroups.filter(p => p.bestStore === 'alfa').length,
    };

    console.log(`Comparison complete:`, stats);

    return new Response(
      JSON.stringify({
        success: true,
        matchedGroups,
        stats,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
