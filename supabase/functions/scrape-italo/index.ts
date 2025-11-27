import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lista completa de paths de categorias
const ALL_PATHS = [
  "homepage", // Página inicial - Promoções/Destaque
  "10950", "11744_11745", "10735", "11001",
  "10735_10744", "10735_10736", "10735_10752", "10735_10761", "10735_10757", "10735_10765",
  "11001_11068", "11001_11049", "11001_11025", "11001_11072", "11001_11042", "11001_11056",
  "11001_11027", "11001_11020", "11001_11038", "11001_11064", "11001_11058", "11001_11005",
  "11001_11023", "11001_11003",
  "10950_10952", "10950_10967", "10950_10964",
  "11077_11218", "11077_11144", "11077_11086", "11077_11096", "11077_11100", "11077_11128",
  "11077_11105", "11077_11079", "11077_11133", "11077_11136", "11077_11214", "11077_11241",
  "11077_11108", "11077_11229", "11077_11148", "11077_11195", "11077_11142", "11077_11225",
  "11077_11112", "11077_11114", "11077_11222", "11077_11190", "11077_11090", "11077_11209",
  "11077_11116",
  "11744_11746", "11744_11752", "11744_11751", "11744_11748", "11744_11750", "11744_11747",
  "11744_11749", "11744",
  "10983_10985", "10983_10993", "10983_11000", "10983_10999", "10983_10989",
  "11250_11280", "11250_11353", "11250_11257", "11250_11315", "11250_11375", "11250_11319",
  "11250_11322", "11250_11294", "11250_11325", "11250_11288", "11250_11271", "11250_11274",
  "11250_11330", "11250_11299", "11250_11327", "11250_11347", "11250_11379", "11250_11266",
  "11250_11260", "11250_11345", "11250_11350", "11250_11337", "11250_11252",
  "10572_10598", "10572_10727", "10572_10573", "10572_10730", "10572_10610", "10572_10583",
  "10572_10619", "10572_10723", "10572_10604",
  "10275_10277", "10275_10540", "10275_10555", "10275_10321", "10275_10283", "10275_10347",
  "10275_10335", "10275_10323", "10275_10356", "10275_10341", "10275_10338", "10275_10353",
  "10275_10382", "10275_10345", "10275_10344", "10275_10304", "10275_10361", "10275_10371",
  "10275_10298", "10275_10293", "10275_10358", "10275_10350", "10275_10348", "10275_10317",
  "10275_10308", "10275_10346", "10275_10349", "10275_10329", "10275_10306", "10275_10563",
  "10275_10319", "10275_10301", "10275_10333", "10275_10314", "10275_10326", "10275_10310",
  "10186_10212", "10186_10192", "10186_10466", "10186_10460", "10186_10160", "10186_10492",
  "10186_10409", "10186_10435", "10186_10526", "10186_10228", "10186_10188", "10186_12095",
  "10186_10508", "10186_10200", "10186_10494", "10186_10487", "10186_10471", "10186_10444",
  "10186_10201", "10186_10537", "10186_10263", "10186_10503", "10186_10489", "10186_10474",
  "11385_11410", "11385_11400", "11385_11386",
  "10865_10905", "10865_10805", "10865_10907", "10865_10880", "10865_10867", "10865_10928",
  "10865_10815", "10865_10926", "10865_10919", "10865_10909", "10865_10844", "10865_10911",
  "10624_10644", "10624_10656", "10624_10630", "10624_10676", "10624_10680", "10624_10650",
  "10624_10688", "10624_10673", "10624_10635", "10624_10691", "10624_10683", "10624_10715",
  "10624_10711", "10624_10705", "10624_10698", "10624_10718", "10624_10625", "10624_10661",
  "10624_10694", "10624_10702",
  "11549_11520", "11549_11778", "11549_11550", "11549_11563", "11549_11782", "11549_11737",
  "11549_11789", "11549_11791", "11549_11507", "11549_11713", "11549_11513", "11549_11475",
  "11549_11753", "11549_11688", "11549_11415", "11549_11651", "11549_11764", "11549_11731"
];

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Cookie": "favorite_store1=4; language=pt-br; currency=BRL"
};

// Converte objeto JS em JSON
function jsObjectToJson(jsText: string): string {
  jsText = jsText.replace(/\/\/.*$/gm, "");
  jsText = jsText.replace(/\r\n/g, "\n");
  jsText = jsText.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
  jsText = jsText.replace(/'((?:\\'|[^'])*)'/g, (_, inner) => {
    const escaped = inner.replace(/"/g, '\\"');
    return `"${escaped}"`;
  });
  jsText = jsText.replace(/,(\s*[}\]])/g, "$1");
  return jsText;
}

// Extrai args dos scripts
function extractArgsFromHtml(html: string): any[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  
  if (!doc) return [];
  
  const results: any[] = [];
  const scripts = doc.querySelectorAll("script");
  
  scripts.forEach((script) => {
    const text = script.textContent || "";
    const re = /const\s+args\s*=\s*({[\s\S]*?});/g;
    let m;
    
    while ((m = re.exec(text)) !== null) {
      let jsObjText = m[1];
      try {
        const jsonText = jsObjectToJson(jsObjText);
        const obj = JSON.parse(jsonText);
        results.push(obj);
      } catch (err) {
        try {
          const fallback = jsObjText
            .replace(/'/g, '"')
            .replace(/,(\s*[}\]])/g, "$1");
          const obj2 = JSON.parse(fallback);
          results.push(obj2);
        } catch (err2) {
          console.warn("Falha ao parsear bloco args:", err2);
        }
      }
    }
  });
  
  return results;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(20000),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.text();
}

function calculateDiscount(price: string, special: string): number {
  const priceNum = parseFloat(price.replace("R$", "").replace(",", ".").trim());
  const specialNum = parseFloat(special.replace("R$", "").replace(",", ".").trim());
  
  if (priceNum && specialNum && specialNum < priceNum) {
    return Math.round(((priceNum - specialNum) / priceNum) * 100);
  }
  return 0;
}

function detectLastPage(html: string): number {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  
  if (!doc) return 1;
  
  const paginationLinks = doc.querySelectorAll(".pagination li a");
  const pageNumbers: number[] = [];
  
  paginationLinks.forEach((link) => {
    const text = link.textContent?.trim();
    const pageNum = parseInt(text || "");
    if (!isNaN(pageNum)) {
      pageNumbers.push(pageNum);
    }
  });
  
  return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
}

async function processCategory(categoryPath: string): Promise<any[]> {
  const cleanPath = categoryPath.replace(/amp;/g, "");
  let baseUrl: string;
  
  if (cleanPath === "homepage") {
    baseUrl = "https://online.superitalo.com.br/";
  } else {
    baseUrl = `https://online.superitalo.com.br/index.php?route=product/category&path=${cleanPath}`;
  }
  
  console.log("Baixando:", baseUrl);
  
  try {
    // Busca primeira página para detectar total de páginas
    const firstPageHtml = await fetchHtml(baseUrl);
    const lastPage = detectLastPage(firstPageHtml);
    
    // Extrai produtos da primeira página
    const firstPageProducts = extractArgsFromHtml(firstPageHtml);
    
    // Se houver mais páginas, busca todas em paralelo
    if (lastPage > 1) {
      console.log(`→ ${cleanPath}: detectadas ${lastPage} páginas`);
      
      const otherPagePromises = [];
      for (let page = 2; page <= lastPage; page++) {
        const pageUrl = `${baseUrl}&page=${page}`;
        otherPagePromises.push(
          fetchHtml(pageUrl)
            .then(html => extractArgsFromHtml(html))
            .catch(err => {
              console.error(`Erro na página ${page} de ${cleanPath}:`, err);
              return [];
            })
        );
      }
      
      const otherPagesProducts = await Promise.all(otherPagePromises);
      const allProducts = [...firstPageProducts, ...otherPagesProducts.flat()];
      
      // Adiciona cálculo de desconto
      const productsWithDiscount = allProducts.map(product => {
        if (product.price && product.special) {
          const discount = calculateDiscount(product.price, product.special);
          return { ...product, discount: discount > 0 ? discount : undefined };
        }
        return product;
      });
      
      console.log(`✅ ${cleanPath}: ${productsWithDiscount.length} produtos (${lastPage} páginas)`);
      return productsWithDiscount;
    }
    
    // Apenas 1 página
    const productsWithDiscount = firstPageProducts.map(product => {
      if (product.price && product.special) {
        const discount = calculateDiscount(product.price, product.special);
        return { ...product, discount: discount > 0 ? discount : undefined };
      }
      return product;
    });
    
    console.log(`✅ ${cleanPath}: ${productsWithDiscount.length} produtos (1 página)`);
    return productsWithDiscount;
  } catch (err) {
    console.error("❌ Erro ao baixar categoria:", cleanPath, "-", err);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (req.method === 'POST' || req.method === 'PUT')
      ? await req.json()
      : {};
    const { department, cursor, maxCategories } = body ?? {};
    
    let pathsToScrape = ALL_PATHS;
    
    // Se um departamento específico foi selecionado, filtra os paths
    if (department && department !== "all") {
      pathsToScrape = ALL_PATHS.filter(path => path.startsWith(department));
    }
    
    const totalCategories = pathsToScrape.length;

    if (totalCategories === 0) {
      console.log("Nenhuma categoria encontrada para o filtro aplicado");
      return new Response(
        JSON.stringify({
          success: true,
          products: [],
          total: 0,
          cursor: null,
          remainingCategories: 0,
          processedCategories: 0,
          totalCategories: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    const effectiveMax =
      typeof maxCategories === 'number' && maxCategories > 0
        ? Math.min(maxCategories, totalCategories)
        : 8; // quantidade máxima de categorias por execução (reduzido para evitar WORKER_LIMIT)

    const startIndex =
      typeof cursor === 'number' && cursor >= 0 && cursor < totalCategories
        ? cursor
        : 0;

    const endIndex = Math.min(startIndex + effectiveMax, totalCategories);
    const currentPaths = pathsToScrape.slice(startIndex, endIndex);

    console.log(
      `Iniciando scraping de categorias ${startIndex} até ${endIndex - 1} (total: ${totalCategories})...`,
    );
    
    let allProducts: any[] = [];
    
    // Processa categorias em batches pequenas para evitar estouro de CPU
    const batchSize = 4; // reduzido porque agora processa menos categorias por execução
    for (let i = 0; i < currentPaths.length; i += batchSize) {
      const batch = currentPaths.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(path => processCategory(path)),
      );
      allProducts.push(...batchResults.flat());
      console.log(
        `Processados ${startIndex + Math.min(i + batch.length, currentPaths.length)}/${totalCategories} categorias`,
      );
    }
    
    const nextCursor = endIndex < totalCategories ? endIndex : null;
    const remainingCategories = totalCategories - endIndex;

    console.log(
      `Batch concluído: ${allProducts.length} produtos. Próximo cursor: ${nextCursor}, restantes: ${remainingCategories}`,
    );
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        products: allProducts,
        total: allProducts.length,
        cursor: nextCursor,
        remainingCategories,
        processedCategories: currentPaths.length,
        totalCategories,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
    
  } catch (error) {
    console.error("Erro no scraping:", error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
