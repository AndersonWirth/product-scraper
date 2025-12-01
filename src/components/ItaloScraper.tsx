import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductCard } from "./ProductCard";

interface Product {
  name: string;
  price?: string;
  special?: string;
  image?: string;
  href?: string;
  discount?: number;
  [key: string]: any;
}

const DEPARTMENTS = [
  { value: "all", label: "Todos os Departamentos" },
  { value: "homepage", label: "Promoção/Destaque" },
  { value: "10735", label: "Açougue" },
  { value: "11001", label: "Bebidas" },
  { value: "10950", label: "Confeitaria e Padaria" },
  { value: "11077", label: "Higiene e Beleza" },
  { value: "11744", label: "Horta e Jardim" },
  { value: "10983", label: "Hortifruti" },
  { value: "11250", label: "Limpeza Caseira" },
  { value: "10572", label: "Matinais" },
  { value: "10275", label: "Mercearia Doce" },
  { value: "10186", label: "Merceria" },
  { value: "11385", label: "Petshop" },
  { value: "10865", label: "Refrigerados" },
  { value: "10624", label: "Saudabilidade" },
  { value: "11549", label: "Utilidades Domésticas" },
];

export const ItaloScraper = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [promotionOnly, setPromotionOnly] = useState(false);
  const { toast } = useToast();

  const handleScrape = async () => {
    setLoading(true);
    setProducts([]);
    setFilteredProducts([]);
    
    try {
      let allProducts: Product[] = [];
      let cursor: number | null = 0;

      // Busca em múltiplos batches até não haver mais categorias (cursor === null)
      while (cursor !== null) {
        const { data, error } = await supabase.functions.invoke("scrape-italo", {
          body: { department: selectedDepartment, cursor, promotionOnly },
        });

        if (error) throw error;

        if (!data?.success) {
          throw new Error(data?.error || "Falha ao buscar produtos");
        }

        if (Array.isArray(data.products)) {
          allProducts = allProducts.concat(data.products as Product[]);
        }

        cursor = data.cursor ?? null;
      }

      setProducts(allProducts);
      setFilteredProducts(allProducts);
      
      toast({
        title: "Sucesso!",
        description: `${allProducts.length} produtos encontrados`,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao buscar produtos",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (!term.trim()) {
      setFilteredProducts(products);
      return;
    }

    const filtered = products.filter((product) =>
      product.name?.toLowerCase().includes(term.toLowerCase())
    );
    setFilteredProducts(filtered);
  };

  const handleExportCSV = () => {
    const headers = ["Nome", "Preço Normal", "Preço Promocional", "Desconto (%)", "Link"];
    const rows = filteredProducts.map((p) => [
      `"${p.name || ""}"`,
      `"${p.price || ""}"`,
      `"${p.special || ""}"`,
      `"${p.discount || ""}"`,
      `"${p.href || ""}"`,
    ]);

    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_italo_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast({
      title: "CSV exportado!",
      description: `${filteredProducts.length} produtos exportados`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um departamento" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleScrape} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buscando...
              </>
            ) : (
              "Iniciar Scraping"
            )}
          </Button>
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="promotionOnly"
            checked={promotionOnly}
            onChange={(e) => setPromotionOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="promotionOnly" className="text-sm font-medium cursor-pointer">
            Apenas Promoções
          </label>
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
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            Mostrando <span className="font-bold text-foreground">{filteredProducts.length}</span> produtos
          </p>
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
            Selecione um departamento e clique em "Iniciar Scraping" para buscar produtos
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
          <ProductCard key={index} product={product} storeType="italo" />
        ))}
      </div>
    </div>
  );
};
