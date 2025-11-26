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
  brand: string;
  price: number;
  promotionalPrice?: number;
  discount?: number;
  inPromotion: boolean;
  salesUnit: string;
  salesCount: number;
  stock: number;
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
  
    console.log(`→ ${hits.length} products fetched (from=${from}, pageSize=${pageSize}, total=${total})`);
  
    allHits = allHits.concat(hits);
  
    if (hits.length < pageSize) {
      // Última página
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

  return allHits.map((product: any) => {
    const price = parseFloat(product.pricing?.price) || 0;
    const promotionalPrice = product.pricing?.promotionalPrice ? parseFloat(product.pricing.promotionalPrice) : undefined;
    const discount = product.pricing?.discount || 0;
  
    return {
      id: product.id || '',
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
    
    // Remove duplicados por ID
    const uniqueProducts = Array.from(
      new Map(flatProducts.map(p => [p.id, p])).values()
    );

    console.log(`Found ${uniqueProducts.length} unique products`);

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
