import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lista completa de paths de categorias
const ALL_PATHS = [
  "10950",
  "11744",
  "10735_10744",
  "10735_10736",
  "10735_10752",
  "10735_10761",
  "10735_10757",
  "10735_10765",
  "10735",
  "11001_11068",
  "11001_11049",
  "11001_11025",
  "11001_11072",
  "11001_11042",
  "11001_11056",
  "11001_11027",
  "11001_11020",
  "11001_11038",
  "11001_11064",
  "11001_11058",
  "11001_11005",
  "11001_11023",
  "11001_11003",
  "11001",
  "10950_10952",
  "10950_10967",
  "10950_10964",
  "10950",
  "11077_11218",
  "11077_11144",
  "11077_11086",
  "11077_11096",
  "11077_11100",
  "11077_11128",
  "11077_11105",
  "11077_11079",
  "11077_11133",
  "11077_11136",
  "11077_11214",
  "11077_11241",
  "11077_11108",
  "11077_11229",
  "11077_11148",
  "11077_11195",
  "11077_11142",
  "11077_11225",
  "11077_11112",
  "11077_11114",
  "11077_11222",
  "11077_11190",
  "11077_11090",
  "11077_11209",
  "11077_11116",
  "11077",
  "11744_11745",
  "11744_11746",
  "11744_11752",
  "11744_11751",
  "11744_11748",
  "11744_11750",
  "11744_11747",
  "11744_11749",
  "11744",
  "10983_10985",
  "10983_10993",
  "10983_11000",
  "10983_10999",
  "10983_10989",
  "10983",
  "11250_11280",
  "11250_11353",
  "11250_11257",
  "11250_11315",
  "11250_11375",
  "11250_11319",
  "11250_11322",
  "11250_11294",
  "11250_11325",
  "11250_11288",
  "11250_11271",
  "11250_11274",
  "11250_11330",
  "11250_11299",
  "11250_11327",
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

async function processCategory(categoryPath: string): Promise<any[]> {
  const cleanPath = categoryPath.replace(/amp;/g, "");
  const url = `https://online.superitalo.com.br/index.php?route=product/category&path=${cleanPath}`;
  
  console.log("Baixando:", url);
  
  try {
    const html = await fetchHtml(url);
    const products = extractArgsFromHtml(html);
    console.log(`→ ${products.length} produtos encontrados em ${cleanPath}`);
    return products;
  } catch (err) {
    console.error("Erro ao baixar categoria:", cleanPath, "-", err);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { department } = await req.json();
    
    let pathsToScrape = ALL_PATHS;
    
    // Se um departamento específico foi selecionado, filtra os paths
    if (department && department !== "all") {
      pathsToScrape = ALL_PATHS.filter(path => path.startsWith(department));
    }
    
    console.log(`Iniciando scraping de ${pathsToScrape.length} categorias...`);
    
    let allProducts: any[] = [];
    
    // Processa categorias em batches para evitar timeout
    const batchSize = 10;
    for (let i = 0; i < pathsToScrape.length; i += batchSize) {
      const batch = pathsToScrape.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(path => processCategory(path))
      );
      allProducts.push(...batchResults.flat());
      console.log(`Processados ${i + batch.length}/${pathsToScrape.length} paths`);
    }
    
    console.log(`Total de produtos encontrados: ${allProducts.length}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        products: allProducts,
        total: allProducts.length 
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
