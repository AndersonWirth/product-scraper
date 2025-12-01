import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeftRight, ArrowLeft, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Product {
  id: string;
  name: string;
  price: number;
  promotionalPrice?: number;
  brand?: string;
  image?: string;
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
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [department, setDepartment] = useState("");
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

  const getAllProducts = async (store: string) => {
    if (store === "italo") {
      // Para Italo, busca TODAS as categorias
      const { data, error } = await supabase.functions.invoke(`scrape-${store}`, {
        body: { department: "all" }
      });
      if (error) throw error;
      return data.products.map((p: any) => ({ ...p, store }));
    } else {
      // Para Marcon e Alfa, usa API com limite máximo
      const requests = [{
        search: "",
        categoryId: "",
        promotion: false,
        limit: 10000,
        sortField: "sales_count",
        sortOrder: "desc"
      }];

      const { data, error } = await supabase.functions.invoke(`scrape-${store}`, {
        body: { requests }
      });

      if (error) throw error;
      return data.products.map((p: any) => ({ ...p, store }));
    }
  };

  const handleLoadProducts = async () => {
    setLoading(true);
    try {
      toast.info("Buscando produtos das 3 filiais...");

      const [italoProducts, marconProducts, alfaProducts] = await Promise.all([
        getAllProducts("italo"),
        getAllProducts("marcon"),
        getAllProducts("alfa")
      ]);

      setAllProducts({
        italo: italoProducts,
        marcon: marconProducts,
        alfa: alfaProducts
      });

      toast.success("Produtos carregados! Use os filtros para comparar.");
    } catch (error: any) {
      console.error("Erro ao carregar:", error);
      toast.error("Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!allProducts.italo.length) {
      toast.error("Carregue os produtos primeiro!");
      return;
    }

    if (!searchTerm && !department) {
      toast.error("Digite um termo de busca ou departamento!");
      return;
    }

    setLoading(true);
    try {
      // Filtra produtos baseado nos critérios
      const filterProducts = (products: Product[]) => {
        return products.filter(p => {
          const matchesSearch = !searchTerm || 
            p.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesDept = !department || 
            (p as any).department?.includes(department);
          return matchesSearch && matchesDept;
        });
      };

      const filteredItalo = filterProducts(allProducts.italo);
      const filteredMarcon = filterProducts(allProducts.marcon);
      const filteredAlfa = filterProducts(allProducts.alfa);

      if (filteredItalo.length === 0) {
        toast.error("Nenhum produto encontrado com os filtros aplicados!");
        setLoading(false);
        return;
      }

      toast.info("Comparando produtos por GTIN...");

      const { data, error } = await supabase.functions.invoke("compare-products-gtin", {
        body: {
          italoProducts: filteredItalo,
          marconProducts: filteredMarcon,
          alfaProducts: filteredAlfa
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
      setLoading(false);
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
        <h1 className="text-4xl font-bold mb-2">Comparador de Produtos por GTIN</h1>
        <p className="text-muted-foreground">
          Comparação precisa por código de barras (GTIN) entre as 3 filiais
        </p>
      </div>

      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Comparação de Produtos</h2>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              1. Primeiro carregue os produtos das 3 filiais
            </p>
            <Button
              onClick={handleLoadProducts}
              disabled={loading || allProducts.italo.length > 0}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando...
                </>
              ) : allProducts.italo.length > 0 ? (
                <>
                  ✓ Produtos Carregados ({allProducts.italo.length} Italo, {allProducts.marcon.length} Marcon, {allProducts.alfa.length} Alfa)
                </>
              ) : (
                "Carregar Produtos"
              )}
            </Button>
          </div>

          {allProducts.italo.length > 0 && (
            <>
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  2. Aplique os filtros desejados
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="search">Buscar por nome</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Ex: Arroz, Feijão, Leite..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="department">Departamento (Italo)</Label>
                    <Input
                      id="department"
                      placeholder="Ex: 11077, 10735..."
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  3. Compare os produtos filtrados
                </p>
                <Button
                  onClick={handleCompare}
                  disabled={loading || (!searchTerm && !department)}
                  size="lg"
                  className="gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Comparando...
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="h-5 w-5" />
                      Comparar Similares
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {stats.totalMatches > 0 && (
        <>
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

          <Card className="mb-8 p-6">
            <h3 className="text-xl font-semibold mb-4">Produtos Comparados</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Produto</th>
                    <th className="text-center p-3 font-semibold">GTIN</th>
                    <th className="text-center p-3 font-semibold">Italo</th>
                    <th className="text-center p-3 font-semibold">Marcon</th>
                    <th className="text-center p-3 font-semibold">Alfa</th>
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
