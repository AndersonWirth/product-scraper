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
  pricing?: {
    price: number;
    promotionalPrice?: number;
  };
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
}

function extractPrice(product: ProductWithGtin): number | null {
  // Tenta extrair o preço efetivo (promocional ou normal)
  if (product.pricing?.promotionalPrice) return product.pricing.promotionalPrice;
  if (product.pricing?.price) return product.pricing.price;
  
  // Se for number direto, retorna
  if (typeof product.promotionalPrice === 'number') return product.promotionalPrice;
  if (typeof product.price === 'number') return product.price;
  
  // Tenta parsear de strings (caso Italo)
  if (product.special && typeof product.special === 'string') {
    const parsed = parseFloat(product.special.replace("R$", "").replace(",", ".").trim());
    if (!isNaN(parsed)) return parsed;
  }
  if (product.price && typeof product.price === 'string') {
    const parsed = parseFloat(product.price.replace("R$", "").replace(",", ".").trim());
    if (!isNaN(parsed)) return parsed;
  }
  if (product.promotionalPrice && typeof product.promotionalPrice === 'string') {
    const parsed = parseFloat(product.promotionalPrice.replace("R$", "").replace(",", ".").trim());
    if (!isNaN(parsed)) return parsed;
  }
  
  return null;
}

function normalizeGtin(gtin: string | undefined): string {
  if (!gtin) return '';
  return gtin.toString().trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { italoProducts = [], marconProducts = [], alfaProducts = [] } = await req.json();

    console.log(
      `Comparing by GTIN: Italo(${italoProducts.length}), Marcon(${marconProducts.length}), Alfa(${alfaProducts.length})`
    );

    // Cria índices por GTIN para busca eficiente
    const italoByGtin = new Map<string, ProductWithGtin>();
    italoProducts.forEach((p: ProductWithGtin) => {
      const gtin = normalizeGtin(p.gtin);
      if (gtin) italoByGtin.set(gtin, p);
    });

    const marconByGtin = new Map<string, ProductWithGtin>();
    marconProducts.forEach((p: ProductWithGtin) => {
      const gtin = normalizeGtin(p.gtin);
      if (gtin) marconByGtin.set(gtin, p);
    });

    const alfaByGtin = new Map<string, ProductWithGtin>();
    alfaProducts.forEach((p: ProductWithGtin) => {
      const gtin = normalizeGtin(p.gtin);
      if (gtin) alfaByGtin.set(gtin, p);
    });

    // Coleta todos os GTINs únicos de todas as lojas
    const allGtins = new Set<string>();
    italoByGtin.forEach((_, gtin) => allGtins.add(gtin));
    marconByGtin.forEach((_, gtin) => allGtins.add(gtin));
    alfaByGtin.forEach((_, gtin) => allGtins.add(gtin));

    const comparedProducts: ComparedProduct[] = [];

    // Processa cada GTIN único
    for (const gtin of allGtins) {
      const italoProduct = italoByGtin.get(gtin);
      const marconProduct = marconByGtin.get(gtin);
      const alfaProduct = alfaByGtin.get(gtin);

      // Conta quantas lojas tem esse produto
      const storesWithProduct = [italoProduct, marconProduct, alfaProduct].filter(Boolean);
      
      // Só compara se houver em pelo menos 2 lojas
      if (storesWithProduct.length < 2) continue;

      const italoPrice = italoProduct ? extractPrice(italoProduct) : null;
      const marconPrice = marconProduct ? extractPrice(marconProduct) : null;
      const alfaPrice = alfaProduct ? extractPrice(alfaProduct) : null;

      // Filtra preços válidos
      const prices: { store: string; price: number }[] = [];
      if (italoPrice) prices.push({ store: 'italo', price: italoPrice });
      if (marconPrice) prices.push({ store: 'marcon', price: marconPrice });
      if (alfaPrice) prices.push({ store: 'alfa', price: alfaPrice });

      if (prices.length < 2) continue;

      // Encontra melhor e pior preço
      const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
      const bestPrice = sortedPrices[0];
      const worstPrice = sortedPrices[sortedPrices.length - 1];

      // Usa o nome do primeiro produto encontrado
      const productName = italoProduct?.name || marconProduct?.name || alfaProduct?.name || '';

      comparedProducts.push({
        gtin,
        name: productName,
        italo: italoPrice ? { price: italoPrice } : undefined,
        marcon: marconPrice ? { price: marconPrice } : undefined,
        alfa: alfaPrice ? { price: alfaPrice } : undefined,
        bestStore: bestPrice.store,
        bestPrice: bestPrice.price,
        worstStore: worstPrice.store,
        worstPrice: worstPrice.price,
        stores: prices.map(p => p.store),
      });
    }

    // Ordena por nome do produto
    comparedProducts.sort((a, b) => a.name.localeCompare(b.name));

    const stats = {
      totalMatches: comparedProducts.length,
      italoBest: comparedProducts.filter(p => p.bestStore === 'italo').length,
      marconBest: comparedProducts.filter(p => p.bestStore === 'marcon').length,
      alfaBest: comparedProducts.filter(p => p.bestStore === 'alfa').length,
    };

    console.log(`GTIN comparison complete: ${stats.totalMatches} products found in 2+ stores`);

    return new Response(
      JSON.stringify({
        success: true,
        comparedProducts,
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
