import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { ProductCard } from "./ProductCard";
import { RequestConfig, RequestConfigData } from "./RequestConfig";

export const MarconScraper = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [requestsCount, setRequestsCount] = useState(0);
  const { toast } = useToast();

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

  const handleAddRequest = () => {
    setRequests([
      ...requests,
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
  };

  const handleRemoveRequest = (id: string) => {
    setRequests(requests.filter((r) => r.id !== id));
  };

  const handleRequestChange = (id: string, field: string, value: any) => {
    setRequests(
      requests.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (!term.trim()) {
      setFilteredProducts(products);
      return;
    }

    const filtered = products.filter((product) =>
      product.name?.toLowerCase().includes(term.toLowerCase()) ||
      product.brand?.toLowerCase().includes(term.toLowerCase()) ||
      String(product.gtin || "").toLowerCase().includes(term.toLowerCase())
    );
    setFilteredProducts(filtered);
  };

  const handleFetchProducts = async () => {
    setLoading(true);
    setRequestsCount(requests.length);

    try {
      const { data, error } = await supabase.functions.invoke("scrape-marcon", {
        body: { requests },
      });

      if (error) throw error;

      if (data.success) {
        setProducts(data.products);
        setFilteredProducts(data.products);
        toast({
          title: "Sucesso!",
          description: `${data.total} produtos encontrados em ${requests.length} requisições`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao buscar produtos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "GTIN",
      "ID", "Nome", "Descrição", "Marca", "Preço", "Preço Promocional",
      "Desconto (%)", "Em Promoção", "Unidade de Venda", "Vendas", "Estoque",
      "Quantidade Mínima", "Quantidade Máxima"
    ];

    const rows = filteredProducts.map((p) => [
      `"${p.gtin || ""}"`,
      `"${p.id || ""}"`,
      `"${p.name || ""}"`,
      `"${p.description || ""}"`,
      `"${p.brandName || ""}"`,
      `"${p.pricing?.price || ""}"`,
      `"${p.pricing?.promotionalPrice || ""}"`,
      `"${p.pricing?.discount || ""}"`,
      `"${p.pricing?.promotion ? "Sim" : "Não"}"`,
      `"${p.saleUnit || ""}"`,
      `"${p.salesCount || 0}"`,
      `"${p.quantity?.inStock || 0}"`,
      `"${p.quantity?.min || ""}"`,
      `"${p.quantity?.max || ""}"`,
    ]);

    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_marcon_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast({
      title: "CSV exportado!",
      description: `${filteredProducts.length} produtos exportados`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {requests.map((request, index) => (
          <RequestConfig
            key={request.id}
            config={request}
            index={index}
            onChange={handleRequestChange}
            onRemove={handleRemoveRequest}
            showRemove={requests.length > 1}
          />
        ))}

        <div className="flex gap-2">
          <Button onClick={handleAddRequest} variant="outline" className="flex-1">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Categoria
          </Button>
          <Button onClick={handleFetchProducts} disabled={loading} className="flex-1">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buscando...
              </>
            ) : (
              "Buscar Produtos"
            )}
          </Button>
        </div>
      </div>

      {products.length > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produtos..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={handleExportCSV} variant="outline" className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      )}

      {filteredProducts.length > 0 && (
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <div className="flex gap-2 items-center flex-wrap">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{filteredProducts.length}</span> produtos
            </p>
            <Badge variant="secondary">
              {requestsCount} {requestsCount === 1 ? "categoria" : "categorias"} buscadas
            </Badge>
            {filteredProducts.filter(p => p.quantity?.inStock < 10).length > 0 && (
              <Badge variant="destructive">
                {filteredProducts.filter(p => p.quantity?.inStock < 10).length} com estoque baixo
              </Badge>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && filteredProducts.length === 0 && products.length === 0 && (
        <div className="rounded-lg border-2 border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Configure as requisições e clique em "Buscar Produtos"
          </p>
        </div>
      )}

      {!loading && filteredProducts.length === 0 && products.length > 0 && (
        <div className="rounded-lg border-2 border-dashed p-12 text-center">
          <p className="text-muted-foreground">Nenhum produto encontrado para essa busca</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredProducts.map((product, index) => (
          <ProductCard key={`${product.id}-${index}`} product={product} storeType="marcon" />
        ))}
      </div>
    </div>
  );
};
