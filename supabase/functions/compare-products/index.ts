import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import stringSimilarity from "https://esm.sh/string-similarity@4.0.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Product {
  id: string;
  name: string;
  price: number;
  promotionalPrice?: number;
  store: string;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findBestMatch(productName: string, products: Product[]) {
  if (products.length === 0) return null;

  const results = products.map(item => ({
    product: item,
    score: stringSimilarity.compareTwoStrings(
      normalize(productName),
      normalize(item.name)
    )
  }));

  results.sort((a, b) => b.score - a.score);

  return results[0].score >= 0.85 ? results[0] : null;
}

function getBestPrice(prices: { store: string; price: number; promotionalPrice?: number }[]) {
  const validPrices = prices.filter(p => p.price > 0);
  if (validPrices.length === 0) return null;

  return validPrices.reduce((best, current) => {
    const currentPrice = current.promotionalPrice || current.price;
    const bestPrice = best.promotionalPrice || best.price;
    return currentPrice < bestPrice ? current : best;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { italoProducts, marconProducts, alfaProducts } = await req.json();

    console.log(`Comparing products: Italo(${italoProducts.length}), Marcon(${marconProducts.length}), Alfa(${alfaProducts.length})`);

    const comparedProducts: any[] = [];
    const allProducts = [...italoProducts, ...marconProducts, ...alfaProducts];
    const processedNames = new Set<string>();

    for (const product of italoProducts) {
      const normalizedName = normalize(product.name);
      if (processedNames.has(normalizedName)) continue;
      processedNames.add(normalizedName);

      const marconMatch = findBestMatch(product.name, marconProducts);
      const alfaMatch = findBestMatch(product.name, alfaProducts);

      if (!marconMatch && !alfaMatch) continue;

      const prices = [
        { store: "italo", price: product.price, promotionalPrice: product.promotionalPrice },
        ...(marconMatch ? [{ store: "marcon", price: marconMatch.product.price, promotionalPrice: marconMatch.product.promotionalPrice }] : []),
        ...(alfaMatch ? [{ store: "alfa", price: alfaMatch.product.price, promotionalPrice: alfaMatch.product.promotionalPrice }] : [])
      ];

      const bestPrice = getBestPrice(prices);
      if (!bestPrice) continue;

      const avgScore = [
        marconMatch?.score || 0,
        alfaMatch?.score || 0
      ].filter(s => s > 0).reduce((a, b) => a + b, 0) / prices.length;

      comparedProducts.push({
        name: product.name,
        italo: { price: product.price, promotionalPrice: product.promotionalPrice },
        marcon: marconMatch ? { price: marconMatch.product.price, promotionalPrice: marconMatch.product.promotionalPrice } : undefined,
        alfa: alfaMatch ? { price: alfaMatch.product.price, promotionalPrice: alfaMatch.product.promotionalPrice } : undefined,
        bestStore: bestPrice.store,
        bestPrice: bestPrice.promotionalPrice || bestPrice.price,
        matchScore: avgScore
      });
    }

    const stats = {
      totalMatches: comparedProducts.length,
      italoBest: comparedProducts.filter(p => p.bestStore === "italo").length,
      marconBest: comparedProducts.filter(p => p.bestStore === "marcon").length,
      alfaBest: comparedProducts.filter(p => p.bestStore === "alfa").length,
      avgMatchScore: comparedProducts.reduce((sum, p) => sum + p.matchScore, 0) / comparedProducts.length
    };

    console.log(`Comparison complete: ${stats.totalMatches} matches found`);

    return new Response(
      JSON.stringify({
        success: true,
        comparedProducts,
        stats
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
