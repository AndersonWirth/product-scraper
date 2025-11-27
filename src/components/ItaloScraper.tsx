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
  { value: "10950", label: "Confeitaria e Padaria" },
  { value: "11744", label: "Horta e Jardim" },
  { value: "10735", label: "Açougue" },
  { value: "10735_10744", label: "Açougue - Carnes" },
  { value: "10735_10745", label: "Açougue - Aves" },
  { value: "10735_10746", label: "Açougue - Cortes Especiais" },
  { value: "10735_10747", label: "Açougue - Suínos" },
  { value: "10738", label: "Bebidas" },
  { value: "10738_10756", label: "Bebidas - Refrigerantes" },
  { value: "10738_10757", label: "Bebidas - Cervejas" },
  { value: "10738_10758", label: "Bebidas - Vinhos" },
  { value: "10738_10759", label: "Bebidas - Sucos" },
  { value: "10738_10760", label: "Bebidas - Águas" },
  { value: "10742", label: "Higiene e Beleza" },
  { value: "10742_10788", label: "Higiene e Beleza - Cuidados Pessoais" },
  { value: "10742_10789", label: "Higiene e Beleza - Cabelos" },
  { value: "10742_10790", label: "Higiene e Beleza - Cosméticos" },
  { value: "10743", label: "Hortifruti" },
  { value: "10743_10795", label: "Hortifruti - Frutas" },
  { value: "10743_10796", label: "Hortifruti - Verduras e Legumes" },
  { value: "10741", label: "Limpeza Caseira" },
  { value: "10741_10778", label: "Limpeza Caseira - Limpeza Geral" },
  { value: "10741_10779", label: "Limpeza Caseira - Lavanderia" },
];

export const ItaloScraper = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
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
          body: { department: selectedDepartment, cursor },
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
          <SelectTrigger className="w-full sm:w-[300px]">
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
