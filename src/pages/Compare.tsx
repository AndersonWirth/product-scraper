import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeftRight, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

interface Product {
  id: string;
  name: string;
  price: number;
  promotionalPrice?: number;
  brand?: string;
  image?: string;
  gtin?: string;
  store: string;
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

export default function Compare() {
  const [loadingItalo, setLoadingItalo] = useState(false);
  const [loadingMarcon, setLoadingMarcon] = useState(false);
  const [loadingAlfa, setLoadingAlfa] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [italoProgress, setItaloProgress] = useState(0);
  
  const [selectedStores, setSelectedStores] = useState({
    italo: true,
    marcon: true,
    alfa: true
  });
  
  const [useSemanticAI, setUseSemanticAI] = useState(false);
  
  const [allProducts, setAllProducts] = useState<{
    italo: Product[];
    marcon: Product[];
    alfa: Product[];
  }>({ italo: [], marcon: [], alfa: [] });
  
  const [comparedProducts, setComparedProducts] = useState<ComparedProduct[]>([]);
  const [stats, setStats] = useState({
    totalMatches: 0,
    italoBest: 0,
    marconBest: 0,
    alfaBest: 0,
  });

  // Carrega TODOS os produtos do Italo usando paginação por cursor
  const loadItaloProducts = async () => {
    setLoadingItalo(true);
    setItaloProgress(0);
    
    try {
      let allItaloProducts: any[] = [];
      let cursor: number | null = 0;
      let totalCategories = 0;
      
      while (cursor !== null) {
        const { data, error } = await supabase.functions.invoke("scrape-italo", {
          body: { 
            department: "all",
            cursor,
            maxCategories: 8
          }
        });
        
        if (error) throw error;
        
        allItaloProducts = [...allItaloProducts, ...data.products];
        cursor = data.cursor;
        totalCategories = data.totalCategories || totalCategories;
        
        // Calcula progresso
        const processed = totalCategories - (data.remainingCategories || 0);
        const progress = totalCategories > 0 ? (processed / totalCategories) * 100 : 0;
        setItaloProgress(progress);
        
        console.log(`Italo: ${allItaloProducts.length} produtos, cursor: ${cursor}, progresso: ${progress.toFixed(0)}%`);
      }
      
      // Remove duplicados por GTIN
      const uniqueProducts = allItaloProducts.reduce((acc, product) => {
        const gtin = product.gtin;
        if (gtin && !acc.find((p: any) => p.gtin === gtin)) {
          acc.push({ ...product, store: "italo" });
        }
        return acc;
      }, [] as any[]);
      
      setAllProducts(prev => ({ ...prev, italo: uniqueProducts }));
      setItaloProgress(100);
      toast.success(`Italo: ${uniqueProducts.length} produtos carregados!`);
    } catch (error: any) {
      console.error("Erro ao carregar Italo:", error);
      toast.error("Erro ao carregar produtos do Italo");
    } finally {
      setLoadingItalo(false);
    }
  };

  // Carrega produtos do Marcon via API
  const loadMarconProducts = async () => {
    setLoadingMarcon(true);
    try {
      const requests = [{
        search: "",
        categoryId: "",
        promotion: false,
        limit: 10000,
        sortField: "sales_count",
        sortOrder: "desc"
      }];

      const { data, error } = await supabase.functions.invoke("scrape-marcon", {
        body: { requests }
      });

      if (error) throw error;
      
      const products = data.products.map((p: any) => ({ ...p, store: "marcon" }));
      setAllProducts(prev => ({ ...prev, marcon: products }));
      toast.success(`Marcon: ${products.length} produtos carregados!`);
    } catch (error: any) {
      console.error("Erro ao carregar Marcon:", error);
      toast.error("Erro ao carregar produtos do Marcon");
    } finally {
      setLoadingMarcon(false);
    }
  };

  // Carrega produtos do Alfa via API
  const loadAlfaProducts = async () => {
    setLoadingAlfa(true);
    try {
      const requests = [{
        search: "",
        categoryId: "",
        promotion: false,
        limit: 10000,
        sortField: "sales_count",
        sortOrder: "desc"
      }];

      const { data, error } = await supabase.functions.invoke("scrape-alfa", {
        body: { requests }
      });

      if (error) throw error;
      
      const products = data.products.map((p: any) => ({ ...p, store: "alfa" }));
      setAllProducts(prev => ({ ...prev, alfa: products }));
      toast.success(`Alfa: ${products.length} produtos carregados!`);
    } catch (error: any) {
      console.error("Erro ao carregar Alfa:", error);
      toast.error("Erro ao carregar produtos do Alfa");
    } finally {
      setLoadingAlfa(false);
    }
  };

  const handleCompare = async () => {
    // Verifica quais lojas estão selecionadas e têm produtos
    const selectedCount = Object.entries(selectedStores).filter(([key, value]) => {
      return value && allProducts[key as keyof typeof allProducts].length > 0;
    }).length;

    if (selectedCount < 2) {
      toast.error("Selecione e carregue pelo menos 2 lojas para comparar!");
      return;
    }

    setComparing(true);
    try {
      toast.info("Comparando todos os produtos por GTIN...");

      const { data, error } = await supabase.functions.invoke("compare-products-gtin", {
        body: {
          italoProducts: selectedStores.italo ? allProducts.italo : [],
          marconProducts: selectedStores.marcon ? allProducts.marcon : [],
          alfaProducts: selectedStores.alfa ? allProducts.alfa : [],
          useSemanticAI
        }
      });

      if (error) throw error;

      setComparedProducts(data.comparedProducts);
      setStats(data.stats);

      toast.success(`${data.stats.totalMatches} produtos comparados com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao comparar:", error);
      toast.error("Erro ao comparar produtos");
    } finally {
      setComparing(false);
    }
  };

  const getPriceColor = (store: string, bestStore: string, worstStore: string) => {
    if (store === bestStore) return "bg-green-100 text-green-800 border-green-500";
    if (store === worstStore) return "bg-red-100 text-red-800 border-red-500";
    return "bg-muted text-muted-foreground";
  };

  const formatPrice = (price?: number) => {
    if (!price && price !== 0) return "-";
    return `R$ ${price.toFixed(2)}`;
  };

  const toggleStore = (store: 'italo' | 'marcon' | 'alfa') => {
    setSelectedStores(prev => ({ ...prev, [store]: !prev[store] }));
  };

  const isAnyLoading = loadingItalo || loadingMarcon || loadingAlfa || comparing;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-4">
        <Link to="/">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Comparador de Produtos</h1>
        <p className="text-muted-foreground">
          Comparação por GTIN entre os supermercados
        </p>
      </div>

      {/* Seção 1: Carregar Produtos */}
      <Card className="p-6 mb-6 bg-green-50/50">
        <h2 className="text-xl font-semibold mb-4">1. Carregar Produtos dos Supermercados</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Italo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="select-italo"
                  checked={selectedStores.italo}
                  onCheckedChange={() => toggleStore('italo')}
                />
                <Label htmlFor="select-italo" className="font-medium">Ítalo</Label>
              </div>
              <Badge variant="outline">{allProducts.italo.length} produtos</Badge>
            </div>
            {loadingItalo && (
              <Progress value={italoProgress} className="h-2" />
            )}
            <Button
              onClick={loadItaloProducts}
              disabled={isAnyLoading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {loadingItalo ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando... {italoProgress.toFixed(0)}%
                </>
              ) : allProducts.italo.length > 0 ? (
                "Recarregar"
              ) : (
                "Carregar"
              )}
            </Button>
          </div>

          {/* Alfa */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="select-alfa"
                  checked={selectedStores.alfa}
                  onCheckedChange={() => toggleStore('alfa')}
                />
                <Label htmlFor="select-alfa" className="font-medium">Alfa</Label>
              </div>
              <Badge variant="outline">{allProducts.alfa.length} produtos</Badge>
            </div>
            <Button
              onClick={loadAlfaProducts}
              disabled={isAnyLoading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {loadingAlfa ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando...
                </>
              ) : allProducts.alfa.length > 0 ? (
                "Recarregar"
              ) : (
                "Carregar"
              )}
            </Button>
          </div>

          {/* Marcon */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="select-marcon"
                  checked={selectedStores.marcon}
                  onCheckedChange={() => toggleStore('marcon')}
                />
                <Label htmlFor="select-marcon" className="font-medium">Marcon</Label>
              </div>
              <Badge variant="outline">{allProducts.marcon.length} produtos</Badge>
            </div>
            <Button
              onClick={loadMarconProducts}
              disabled={isAnyLoading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {loadingMarcon ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando...
                </>
              ) : allProducts.marcon.length > 0 ? (
                "Recarregar"
              ) : (
                "Carregar"
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Seção 2: Configurar e Comparar */}
      <Card className="p-6 mb-6 bg-green-50/50">
        <h2 className="text-xl font-semibold mb-4">2. Configurar e Comparar</h2>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="use-ai"
              checked={useSemanticAI}
              onCheckedChange={setUseSemanticAI}
            />
            <Label htmlFor="use-ai">Usar IA Semântica (Google AI Studio)</Label>
          </div>
          
          <Button
            onClick={handleCompare}
            disabled={isAnyLoading}
            size="lg"
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-6"
          >
            {comparing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Comparando...
              </>
            ) : (
              <>
                <ArrowLeftRight className="h-5 w-5 mr-2" />
                Comparar Produtos
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Área de Resultados */}
      {stats.totalMatches === 0 && !comparing ? (
        <Card className="p-12 border-2 border-dashed bg-green-50/30">
          <p className="text-center text-muted-foreground">
            Carregue produtos dos supermercados para começar a comparação
          </p>
        </Card>
      ) : (
        <>
          {/* Estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="p-6">
              <div className="text-sm text-muted-foreground mb-1">Total de Matches</div>
              <div className="text-3xl font-bold">{stats.totalMatches}</div>
            </Card>
            <Card className="p-6">
              <div className="text-sm text-muted-foreground mb-1">Italo - Melhor Preço</div>
              <div className="text-3xl font-bold text-blue-600">{stats.italoBest}</div>
            </Card>
            <Card className="p-6">
              <div className="text-sm text-muted-foreground mb-1">Marcon - Melhor Preço</div>
              <div className="text-3xl font-bold text-purple-600">{stats.marconBest}</div>
            </Card>
            <Card className="p-6">
              <div className="text-sm text-muted-foreground mb-1">Alfa - Melhor Preço</div>
              <div className="text-3xl font-bold text-orange-600">{stats.alfaBest}</div>
            </Card>
          </div>

          {/* Tabela de Comparação */}
          <Card className="mb-8 p-6">
            <h3 className="text-xl font-semibold mb-4">Produtos Comparados ({comparedProducts.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Produto</th>
                    <th className="text-center p-3 font-semibold">GTIN</th>
                    {selectedStores.italo && <th className="text-center p-3 font-semibold">Italo</th>}
                    {selectedStores.alfa && <th className="text-center p-3 font-semibold">Alfa</th>}
                    {selectedStores.marcon && <th className="text-center p-3 font-semibold">Marcon</th>}
                  </tr>
                </thead>
                <tbody>
                  {comparedProducts.map((product, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <div className="font-medium">{product.name}</div>
                        <Badge variant="outline" className="mt-1">
                          Melhor: {product.bestStore}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {product.gtin}
                        </code>
                      </td>
                      {selectedStores.italo && (
                        <td className="p-3 text-center">
                          {product.italo ? (
                            <Card className={`p-2 border-2 ${getPriceColor("italo", product.bestStore, product.worstStore)}`}>
                              <div className="font-semibold">
                                {formatPrice(product.italo.price)}
                              </div>
                            </Card>
                          ) : (
                            <div className="text-muted-foreground text-sm">-</div>
                          )}
                        </td>
                      )}
                      {selectedStores.alfa && (
                        <td className="p-3 text-center">
                          {product.alfa ? (
                            <Card className={`p-2 border-2 ${getPriceColor("alfa", product.bestStore, product.worstStore)}`}>
                              <div className="font-semibold">
                                {formatPrice(product.alfa.price)}
                              </div>
                            </Card>
                          ) : (
                            <div className="text-muted-foreground text-sm">-</div>
                          )}
                        </td>
                      )}
                      {selectedStores.marcon && (
                        <td className="p-3 text-center">
                          {product.marcon ? (
                            <Card className={`p-2 border-2 ${getPriceColor("marcon", product.bestStore, product.worstStore)}`}>
                              <div className="font-semibold">
                                {formatPrice(product.marcon.price)}
                              </div>
                            </Card>
                          ) : (
                            <div className="text-muted-foreground text-sm">-</div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
