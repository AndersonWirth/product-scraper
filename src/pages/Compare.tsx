import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeftRight, ArrowLeft } from "lucide-react";
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
  name: string;
  italo?: { price: number; promotionalPrice?: number };
  marcon?: { price: number; promotionalPrice?: number };
  alfa?: { price: number; promotionalPrice?: number };
  bestStore: string;
  bestPrice: number;
  matchScore: number;
}

export default function Compare() {
  const [loading, setLoading] = useState(false);
  const [comparedProducts, setComparedProducts] = useState<ComparedProduct[]>([]);
  const [stats, setStats] = useState({
    totalMatches: 0,
    italoBest: 0,
    marconBest: 0,
    alfaBest: 0,
    avgMatchScore: 0
  });

  const getAllProducts = async (store: string) => {
    const requests = [{
      search: "",
      categoryId: "",
      promotion: false,
      limit: 1000,
      sortField: "sales_count",
      sortOrder: "desc"
    }];

    const { data, error } = await supabase.functions.invoke(`scrape-${store}`, {
      body: { requests }
    });

    if (error) throw error;
    return data.products.map((p: any) => ({ ...p, store }));
  };

  const handleCompare = async () => {
    setLoading(true);
    try {
      toast.info("Buscando produtos das 3 filiais...");

      const [italoProducts, marconProducts, alfaProducts] = await Promise.all([
        getAllProducts("italo"),
        getAllProducts("marcon"),
        getAllProducts("alfa")
      ]);

      toast.info("Comparando produtos...");

      const { data, error } = await supabase.functions.invoke("compare-products", {
        body: {
          italoProducts,
          marconProducts,
          alfaProducts
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

  const getBestPriceColor = (store: string, bestStore: string) => {
    if (store === bestStore) return "bg-success/10 text-success border-success";
    return "bg-muted text-muted-foreground";
  };

  const formatPrice = (price?: number) => {
    if (!price) return "-";
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
        <h1 className="text-4xl font-bold mb-2">Comparador de Produtos</h1>
        <p className="text-muted-foreground">
          Compare preços e encontre os melhores matches entre as 3 filiais
        </p>
      </div>

      <Card className="p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-2">Iniciar Comparação</h2>
            <p className="text-sm text-muted-foreground">
              Clique no botão para comparar todos os produtos das 3 filiais
            </p>
          </div>
          <Button
            onClick={handleCompare}
            disabled={loading}
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
                    <th className="text-center p-3 font-semibold">Italo</th>
                    <th className="text-center p-3 font-semibold">Marcon</th>
                    <th className="text-center p-3 font-semibold">Alfa</th>
                    <th className="text-center p-3 font-semibold">Match Score</th>
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
                        <Card className={`p-2 ${getBestPriceColor("italo", product.bestStore)}`}>
                          <div className="font-semibold">
                            {formatPrice(product.italo?.promotionalPrice || product.italo?.price)}
                          </div>
                          {product.italo?.promotionalPrice && (
                            <div className="text-xs line-through opacity-60">
                              {formatPrice(product.italo.price)}
                            </div>
                          )}
                        </Card>
                      </td>
                      <td className="p-3 text-center">
                        <Card className={`p-2 ${getBestPriceColor("marcon", product.bestStore)}`}>
                          <div className="font-semibold">
                            {formatPrice(product.marcon?.promotionalPrice || product.marcon?.price)}
                          </div>
                          {product.marcon?.promotionalPrice && (
                            <div className="text-xs line-through opacity-60">
                              {formatPrice(product.marcon.price)}
                            </div>
                          )}
                        </Card>
                      </td>
                      <td className="p-3 text-center">
                        <Card className={`p-2 ${getBestPriceColor("alfa", product.bestStore)}`}>
                          <div className="font-semibold">
                            {formatPrice(product.alfa?.promotionalPrice || product.alfa?.price)}
                          </div>
                          {product.alfa?.promotionalPrice && (
                            <div className="text-xs line-through opacity-60">
                              {formatPrice(product.alfa.price)}
                            </div>
                          )}
                        </Card>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={product.matchScore >= 0.9 ? "default" : "secondary"}>
                          {(product.matchScore * 100).toFixed(0)}%
                        </Badge>
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
