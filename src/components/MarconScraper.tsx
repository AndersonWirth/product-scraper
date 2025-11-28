// MarconScraper.tsx — ARQUIVO FINAL COMPLETO UNIFICADO

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, TestTube } from "lucide-react";
import { useState } from "react";
import { ProductCard } from "./ProductCard";
import { RequestConfigData } from "./RequestConfig";

// =======================================================
// TIPAGEM DOS PRODUTOS (mapeados da API LA MARCON)
// =======================================================

interface MarconProduct {
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
  promotionActive: boolean;
  promotionName?: string;
  promotionType?: string;
  startDate?: string;
  endDate?: string;
  image?: string;
}

// =======================================================
// FETCH LOCAL PARA DEBUG — COMPLETO
// =======================================================

async function fetchProductsLocal(config: RequestConfig): Promise<MarconProduct[]> {
  const pageSize = Math.min(1000, config.limit || 1000);
  const maxTotal = config.limit || 1000;

  let from = 0;
  let allHits: any[] = [];

  while (allHits.length < maxTotal) {
    const params = new URLSearchParams();

    params.append("promotion", config.promotion ? "true" : "false");
    params.append("brands", "");
    if (config.categoryId) params.append("categories", config.categoryId);
    params.append("tags", "");
    params.append("personas", "");
    params.append("size", pageSize.toString());
    params.append("from", from.toString());
    if (config.search) params.append("search", config.search);
    params.append("sortField", config.sortField);
    params.append("sortOrder", config.sortOrder);

    const url = `https://sense.osuper.com.br/16/32/search?${params.toString()}`;

    console.log(`📡 Fetching: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const hits = data?.hits || [];
    const total = typeof data?.total === "number" ? data.total : undefined;

    if (hits.length > 0) {
      console.log("✅ PRIMEIRO PRODUTO BRUTO DA API:", hits[0]);
      console.log("🏷️ GTIN NO PRODUTO BRUTO:", hits[0]?.gtin);
      console.log("📋 TODOS OS CAMPOS:", Object.keys(hits[0]));
    }

    console.log(`→ ${hits.length} produtos buscados`);

    allHits = allHits.concat(hits);

    if (hits.length < pageSize) break;
    if (total !== undefined && from + pageSize >= total) break;

    from += pageSize;
    if (allHits.length >= maxTotal) break;
  }

  console.log(`✨ Total de produtos coletados: ${allHits.length}`);

  return allHits.map((product: any, index: number) => {
    const price = parseFloat(product.pricing?.price) || 0;
    const promotionalPrice = product.pricing?.promotionalPrice
      ? parseFloat(product.pricing.promotionalPrice)
      : undefined;
    const discount = product.pricing?.discount || 0;

    if (index === 0) {
      console.log("========== DEBUG DO PRIMEIRO PRODUTO ==========");
      console.log("ID:", product.gtin, product.ean, product.barcode, product.code);
      console.log("GTIN original:", product.gtin);
      console.log("EAN:", product.ean);
      console.log("Barcode:", product.barcode);
      console.log("Code:", product.code);
      console.log("Nome:", product.name);
    }

    const mapped: MarconProduct = {
      id: product.id || "",
      gtin: product.gtin || product.ean || product.barcode || product.code || "",
      name: product.name || "",
      description: product.description || "",
      brand: product.brandName || "",
      price,
      promotionalPrice,
      discount: discount > 0 ? discount : undefined,
      inPromotion: product.pricing?.promotion || false,
      salesUnit: product.saleUnit || "UN",
      salesCount: parseInt(product.salesCount) || 0,
      stock: parseInt(product.quantity?.inStock) || 0,
      promotionActive: product.promotions?.active || false,
      promotionName: product.promotions?.promotionName,
      promotionType: product.promotions?.promotionType,
      startDate: product.promotions?.startDate,
      endDate: product.promotions?.endDate,
      image: product.image || "",
    };

    if (index === 0) {
      console.log("GTIN após mapeamento:", mapped.gtin);
      console.log("Objeto completo:", mapped);
      console.log("=============================================");
    }

    return mapped;
  });
}

// =======================================================
// COMPONENTE PRINCIPAL
// =======================================================

export const MarconScraper = () => {
  const { toast } = useToast();

  const [products, setProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [requests, setRequests] = useState<RequestConfigData[]>([
    {
      id: crypto.randomUUID(),
      search: "",
      categoryId: "",
      promotion: false,
      limit: 50,
      sortField: "sales_count",
      sortOrder: "desc",
    },
  ]);

  // ===================================================
  // TESTE LOCAL (DEBUG) — TOTALMENTE INTEGRADO
  // ===================================================

  const handleTestLocal = async () => {
    setLoading(true);
    setTestMode(true);

    try {
      console.log("🧪 INICIANDO TESTE LOCAL...");

      const config: RequestConfigData = {
        id: "test",
        search: "",
        categoryId: "",
        promotion: false,
        limit: 5,
        sortField: "sales_count",
        sortOrder: "desc",
      };

      const p = await fetchProductsLocal(config);

      console.log("🎉 TESTE CONCLUÍDO!");
      console.log("Total de produtos:", p.length);
      console.log("Primeiro produto:", p[0]);
      console.log("GTIN do primeiro:", p[0]?.gtin);

      setProducts(p);
      setFilteredProducts(p);

      toast({
        title: "✅ Teste Local Concluído!",
        description: `${p.length} produtos carregados. Verifique o console (F12).`,
      });
    } catch (error: any) {
      console.error("❌ Erro:", error);

      toast({
        title: "❌ Erro ao testar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ===================================================
  // BUSCAR PRODUTOS (BOTÃO PRINCIPAL)
  // ===================================================

  const handleSearchProducts = async () => {
    setLoading(true);
    setTestMode(false);

    try {
      const config = requests[0];

      const p = await fetchProductsLocal(config);

      setProducts(p);
      setFilteredProducts(p);

      toast({
        title: "🔍 Busca concluída!",
        description: `${p.length} produtos retornados.`,
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ===================================================
  // FILTRAGEM LOCAL
  // ===================================================

  const handleFilterChange = (value: string) => {
    setSearchTerm(value);

    const filtered = products.filter((p) =>
      p.name.toLowerCase().includes(value.toLowerCase())
    );

    setFilteredProducts(filtered);
  };

  // ===================================================
  // ================= RENDER ==========================
  // ===================================================

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Filtrar por nome..."
            value={searchTerm}
            onChange={(e) => handleFilterChange(e.target.value)}
          />

          <Button onClick={handleSearchProducts} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Buscando...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> Buscar Produtos
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            onClick={handleTestLocal}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testando...
              </>
            ) : (
              <>
                <TestTube className="mr-2 h-4 w-4" /> 🧪 Teste Local
              </>
            )}
          </Button>
        </div>

        {testMode && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              💡 <strong>Modo Debug Ativo!</strong> Abra o Console (F12) para ver
              logs completos.
            </p>
          </div>
        )}
      </div>

      {/* LISTA DE PRODUTOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} storeType="marcon" />
        ))}
      </div>
    </div>
  );
};
