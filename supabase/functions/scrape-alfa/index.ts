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
  // TODO: Replace with actual Alfa API endpoint
  const params = new URLSearchParams();
  
  if (config.search) params.append('search', config.search);
  if (config.categoryId) params.append('categories', config.categoryId);
  if (config.promotion) params.append('promotion', 'true');
  params.append('size', config.limit.toString());
  params.append('from', '0');
  params.append('sortField', config.sortField);
  params.append('sortOrder', config.sortOrder);

  // Using same endpoint as Marcon for now - UPDATE THIS URL
  const url = `https://sense.osuper.com.br/16/32/search?${params.toString()}`;
  
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
  const hits = data?.hits?.hits || [];

  return hits.map((hit: any) => {
    const source = hit._source || {};
    const price = parseFloat(source.price) || 0;
    const promotionalPrice = source.promotional_price ? parseFloat(source.promotional_price) : undefined;
    
    let discount = 0;
    if (promotionalPrice && promotionalPrice < price) {
      discount = Math.round(((price - promotionalPrice) / price) * 100);
    }

    return {
      id: source.id || hit._id,
      name: source.name || '',
      description: source.description || '',
      brand: source.brand || '',
      price,
      promotionalPrice,
      discount: discount > 0 ? discount : undefined,
      inPromotion: !!promotionalPrice,
      salesUnit: source.sales_unit || 'UN',
      salesCount: parseInt(source.sales_count) || 0,
      stock: parseInt(source.stock) || 0,
      promotionActive: source.promotion_active || false,
      promotionName: source.promotion_name,
      promotionType: source.promotion_type,
      startDate: source.start_date,
      endDate: source.end_date,
      image: source.image_url,
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
