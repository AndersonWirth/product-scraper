import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestConfig {
  search: string;
  categoryId: string;
  promotion: boolean;
  limit: number;
  sortField: string;
  sortOrder: string;
}

interface AlfaProduct {
  id: string;
  name: string;
  description: string;
  gtin?: string;
  brand: string;
  price: number;
  promotionalPrice?: number;
  discount?: number;
  inPromotion: boolean;
  salesUnit: string;
  salesCount: number;
  stock: number;
  minQuantity?: number;        // ✅ ADICIONADO
  maxQuantity?: number;        // ✅ ADICIONADO
  promotionActive: boolean;
  promotionName?: string;
  promotionType?: string;
  startDate?: string;
  endDate?: string;
  image?: string;
}

async function fetchProducts(config: RequestConfig): Promise<AlfaProduct[]> {
  const pageSize = Math.min(1000, config.limit || 1000);
  const maxTotal = config.limit || 1000;

  let from = 0;
  let allHits: any[] = [];

  while (allHits.length < maxTotal) {
    const params = new URLSearchParams();
    
    params.append('promotion', config.promotion ? 'true' : 'false');
    params.append('brands', '');
    if (config.categoryId) params.append('categories', config.categoryId);
    params.append('tags', '');
    params.append('personas', '');
    params.append('size', pageSize.toString());
    params.append('from', from.toString());
    if (config.search) params.append('search', config.search);
    params.append('sortField', config.sortField);
    params.append('sortOrder', config.sortOrder);

    const url = `https://sense.osuper.com.br/69/226/search?${params.toString()}`;
    
    console.log(`Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
  
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  
    const data = await response.json();
    const hits = data?.hits || [];
    const total = typeof data?.total === 'number' ? data.total : undefined;

    // ✅ DEBUG: Log do primeiro produto
    if (hits.length > 0 && from === 0) {
      console.log('✅ PRIMEIRO PRODUTO BRUTO (ALFA):', JSON.stringify(hits[0], null, 2));
      console.log('🏷️ GTIN NO PRODUTO BRUTO:', hits[0]?.gtin);
      console.log('📋 TODOS OS CAMPOS:', Object.keys(hits[0]));
    }
  
    console.log(`→ ${hits.length} products fetched (from=${from}, pageSize=${pageSize}, total=${total})`);
  
    allHits = allHits.concat(hits);
  
    if (hits.length < pageSize) {
      break;
    }
  
    if (total !== undefined && from + pageSize >= total) {
      break;
    }
  
    from += pageSize;
  
    if (allHits.length >= maxTotal) {
      break;
    }
  }

  console.log(`Total hits collected: ${allHits.length}`);

  // ✅ MAPEAMENTO CORRETO (igual ao Marcon que funciona)
  return allHits.map((product: any, index: number) => {
    const price = parseFloat(product.pricing?.price) || 0;
    const promotionalPrice = product.pricing?.promotionalPrice 
      ? parseFloat(product.pricing.promotionalPrice) 
      : undefined;
    const discount = product.pricing?.discount || 0;

    // ✅ DEBUG: Log do primeiro produto mapeado
    if (index === 0) {
      console.log("========== DEBUG DO PRIMEIRO PRODUTO (ALFA) ==========");
      console.log("GTIN original:", product.gtin);
      console.log("EAN:", product.ean);
      console.log("Barcode:", product.barcode);
      console.log("Code:", product.code);
    }

    const mapped: AlfaProduct = {
      id: product.id || '',
      gtin: product.gtin || product.ean || product.barcode || product.code || '',
      name: product.name || '',
      description: product.description || '',
      brand: product.brandName || '',
      price,
      promotionalPrice,
      discount: discount > 0 ? discount : undefined,
      inPromotion: product.pricing?.promotion || false,
      salesUnit: product.saleUnit || 'UN',
      salesCount: parseInt(product.salesCount) || 0,
      stock: parseInt(product.quantity?.inStock) || 0,
      minQuantity: parseFloat(product.quantity?.min) || undefined,
      maxQuantity: parseFloat(product.quantity?.max) || undefined,
      promotionActive: product.promotions?.active || false,
      promotionName: product.promotions?.promotionName,
      promotionType: product.promotions?.promotionType,
      startDate: product.promotions?.startDate,
      endDate: product.promotions?.endDate,
      image: product.image || '',
    };

    if (index === 0) {
      console.log("GTIN após mapeamento:", mapped.gtin);
      console.log("Objeto completo mapeado:", JSON.stringify(mapped, null, 2));
      console.log("=============================================");
    }

    return mapped;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requests } = await req.json();

    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Invalid requests array');
    }

    console.log(`Processing ${requests.length} requests...`);

    const allProducts = await Promise.all(
      requests.map(config => fetchProducts(config))
    );

    const flatProducts = allProducts.flat();
    
    // ✅ REMOVENDO DUPLICADOS PRESERVANDO GTIN
    const uniqueProducts = Array.from(
      new Map(flatProducts.map(p => [p.id, p])).values()
    );

    console.log(`Found ${uniqueProducts.length} unique products`);
    
    // ✅ DEBUG FINAL: Log antes de retornar
    if (uniqueProducts.length > 0) {
      console.log('✅ PRIMEIRO PRODUTO ANTES DO RETORNO:', JSON.stringify(uniqueProducts[0], null, 2));
      console.log('🏷️ GTIN DO PRIMEIRO PRODUTO:', uniqueProducts[0]?.gtin);
    }

    return new Response(
      JSON.stringify({
        success: true,
        products: uniqueProducts,
        total: uniqueProducts.length,
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