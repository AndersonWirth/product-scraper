import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, ShoppingCart, Filter, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Product {
  name?: string;
  price?: string;
  special?: string;
  image?: string;
  href?: string;
  [key: string]: any;
}

const DEPARTMENTS = [
  { value: "all", label: "Todos os Departamentos" },
  { value: "10950", label: "Confeitaria e Padaria" },
  { value: "11744", label: "Horta e Jardim" },
  { value: "10735", label: "Açougue" },
  { value: "11001", label: "Bebidas" },
  { value: "11077", label: "Higiene e Beleza" },
  { value: "10983", label: "Hortifruti" },
  { value: "11250", label: "Limpeza Caseira" },
];

const Index = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");

  const handleScrape = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-italo", {
        body: { department: selectedDept === "all" ? null : selectedDept },
      });

      if (error) throw error;

      if (data?.products) {
        setProducts(data.products);
        setFilteredProducts(data.products);
        toast({
          title: "Sucesso!",
          description: `${data.products.length} produtos carregados`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao fazer scraping",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (!value) {
      setFilteredProducts(products);
      return;
    }
    
    const filtered = products.filter((product) =>
      product.name?.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredProducts(filtered);
  };

  const handleExportCSV = () => {
    if (filteredProducts.length === 0) {
      toast({
        title: "Nenhum produto para exportar",
        variant: "destructive",
      });
      return;
    }

    const headers = Object.keys(filteredProducts[0]);
    const csvContent = [
      headers.join(";"),
      ...filteredProducts.map((product) =>
        headers.map((h) => `"${product[h] || ""}"`).join(";")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "produtos_italo.csv";
    link.click();

    toast({
      title: "CSV exportado!",
      description: `${filteredProducts.length} produtos exportados`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm sticky top-0 z-10 backdrop-blur-sm bg-card/95">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <ShoppingCart className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Super Italo Scraper
            </h1>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger className="w-full md:w-[280px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleScrape}
              disabled={loading}
              className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Buscando produtos...
                </>
              ) : (
                "Iniciar Scraping"
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Search & Export */}
      {products.length > 0 && (
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                type="text"
                placeholder="Pesquisar produtos..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
            
            <Button
              onClick={handleExportCSV}
              variant="outline"
              className="w-full md:w-auto border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV ({filteredProducts.length})
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Mostrando {filteredProducts.length} de {products.length} produtos
            </p>
          </div>
        </div>
      )}

      {/* Products Grid */}
      <main className="container mx-auto px-4 pb-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-16 h-16 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Carregando produtos da loja...</p>
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
            {filteredProducts.map((product, index) => (
              <Card
                key={index}
                className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border"
              >
                {product.image && (
                  <div className="aspect-square bg-muted relative overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name || "Produto"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                
                <div className="p-4 space-y-3">
                  <h3 className="font-semibold text-base line-clamp-2 min-h-[48px]">
                    {product.name || "Sem nome"}
                  </h3>
                  
                  <div className="flex items-baseline gap-2">
                    {product.special ? (
                      <>
                        <span className="text-2xl font-bold text-secondary">
                          R$ {product.special}
                        </span>
                        <span className="text-sm line-through text-muted-foreground">
                          R$ {product.price}
                        </span>
                      </>
                    ) : (
                      <span className="text-2xl font-bold text-primary">
                        R$ {product.price || "0,00"}
                      </span>
                    )}
                  </div>

                  {product.special && (
                    <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
                      Promoção
                    </Badge>
                  )}

                  {product.href && (
                    <a
                      href={product.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline block truncate"
                    >
                      Ver no site
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : !loading && (
          <div className="text-center py-20">
            <ShoppingCart className="w-24 h-24 mx-auto text-muted-foreground/30 mb-6" />
            <h2 className="text-2xl font-semibold mb-2">Nenhum produto encontrado</h2>
            <p className="text-muted-foreground mb-6">
              Selecione um departamento e clique em "Iniciar Scraping" para começar
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
