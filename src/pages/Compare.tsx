import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeftRight, ArrowLeft, Download, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from "xlsx";

interface Product { id: string; name: string; price: number; promotionalPrice?: number; brand?: string; image?: string; gtin?: string; store: string; }
interface ComparedProduct { gtin: string; name: string; italo?: { price: number }; marcon?: { price: number }; alfa?: { price: number }; bestStore: string; bestPrice: number; worstStore: string; worstPrice: number; stores: string[]; matchType: 'gtin' | 'description' | 'semantic'; matchScore?: number; }
interface UnmatchedProduct { gtin?: string; name: string; price: number | null; store: string; }

export default function Compare() {
  const [loadingItalo, setLoadingItalo] = useState(false);
  const [loadingMarcon, setLoadingMarcon] = useState(false);
  const [loadingAlfa, setLoadingAlfa] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [italoProgress, setItaloProgress] = useState(0);
  const [selectedStores, setSelectedStores] = useState({ italo: true, marcon: true, alfa: true });
  const [useSemanticAI, setUseSemanticAI] = useState(false);
  const [exportStore, setExportStore] = useState<string>("best");
  const [allProducts, setAllProducts] = useState<{ italo: Product[]; marcon: Product[]; alfa: Product[]; }>({ italo: [], marcon: [], alfa: [] });
  const [comparedProducts, setComparedProducts] = useState<ComparedProduct[]>([]);
  const [unmatchedProducts, setUnmatchedProducts] = useState<UnmatchedProduct[]>([]);
  const [stats, setStats] = useState({ totalMatches: 0, gtinMatches: 0, descriptionMatches: 0, semanticMatches: 0, unmatchedCount: 0, italoBest: 0, marconBest: 0, alfaBest: 0 });

  const loadItaloProducts = async () => {
    setLoadingItalo(true); setItaloProgress(0);
    try {
      let all: any[] = [], cursor: number | null = 0, total = 0;
      while (cursor !== null) {
        const { data, error } = await supabase.functions.invoke("scrape-italo", { body: { department: "all", cursor, maxCategories: 8 } });
        if (error) throw error;
        all = [...all, ...data.products]; cursor = data.cursor; total = data.totalCategories || total;
        setItaloProgress(total > 0 ? ((total - (data.remainingCategories || 0)) / total) * 100 : 0);
      }
      const unique = all.reduce((acc, p) => { if (p.gtin && !acc.find((x: any) => x.gtin === p.gtin)) acc.push({ ...p, store: "italo" }); else if (!p.gtin) acc.push({ ...p, store: "italo" }); return acc; }, [] as any[]);
      setAllProducts(prev => ({ ...prev, italo: unique })); setItaloProgress(100);
      toast.success(`Italo: ${unique.length} produtos!`);
    } catch (e) { console.error(e); toast.error("Erro ao carregar Italo"); } finally { setLoadingItalo(false); }
  };

  const loadMarconProducts = async () => {
    setLoadingMarcon(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-marcon", { body: { requests: [{ search: "", categoryId: "", promotion: false, limit: 10000, sortField: "sales_count", sortOrder: "desc" }] } });
      if (error) throw error;
      setAllProducts(prev => ({ ...prev, marcon: data.products.map((p: any) => ({ ...p, store: "marcon" })) }));
      toast.success(`Marcon: ${data.products.length} produtos!`);
    } catch (e) { console.error(e); toast.error("Erro ao carregar Marcon"); } finally { setLoadingMarcon(false); }
  };

  const loadAlfaProducts = async () => {
    setLoadingAlfa(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-alfa", { body: { requests: [{ search: "", categoryId: "", promotion: false, limit: 10000, sortField: "sales_count", sortOrder: "desc" }] } });
      if (error) throw error;
      setAllProducts(prev => ({ ...prev, alfa: data.products.map((p: any) => ({ ...p, store: "alfa" })) }));
      toast.success(`Alfa: ${data.products.length} produtos!`);
    } catch (e) { console.error(e); toast.error("Erro ao carregar Alfa"); } finally { setLoadingAlfa(false); }
  };

  const handleCompare = async () => {
    const selected = Object.entries(selectedStores).filter(([k, v]) => v && allProducts[k as keyof typeof allProducts].length > 0).length;
    if (selected < 2) { toast.error("Selecione pelo menos 2 lojas!"); return; }
    setComparing(true);
    try {
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
      setUnmatchedProducts(data.unmatchedProducts || []);
      setStats(data.stats);
      toast.success(`${data.stats.totalMatches} produtos comparados! (${data.stats.unmatchedCount} não comparados)`);
    } catch (e) { console.error(e); toast.error("Erro ao comparar"); } finally { setComparing(false); }
  };

  const handleExportExcel = () => {
    if (!comparedProducts.length) { toast.error("Nenhum produto!"); return; }
    const exportData = exportStore === "best" 
      ? comparedProducts.map(p => ({ GTIN: p.gtin.startsWith('DESC-') || p.gtin.startsWith('SEM-') ? '' : p.gtin, Nome: p.name, Preço: `R$ ${p.bestPrice.toFixed(2)}` }))
      : comparedProducts.filter(p => p[exportStore as keyof ComparedProduct]).map(p => ({ GTIN: p.gtin.startsWith('DESC-') || p.gtin.startsWith('SEM-') ? '' : p.gtin, Nome: p.name, Preço: `R$ ${(p[exportStore as keyof ComparedProduct] as any)?.price?.toFixed(2) || '-'}` }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    XLSX.writeFile(wb, `produtos_${exportStore === "best" ? "melhor_preco" : exportStore}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`${exportData.length} produtos exportados!`);
  };

  const handleExportUnmatched = () => {
    if (!unmatchedProducts.length) { toast.error("Nenhum produto não comparado!"); return; }
    const exportData = unmatchedProducts.map(p => ({ 
      GTIN: p.gtin || '', 
      Nome: p.name, 
      Preço: p.price ? `R$ ${p.price.toFixed(2)}` : '-',
      Loja: p.store.charAt(0).toUpperCase() + p.store.slice(1)
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Não Comparados");
    XLSX.writeFile(wb, `produtos_nao_comparados_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`${exportData.length} produtos exportados!`);
  };

  const getPriceColor = (store: string, best: string, worst: string) => store === best ? "bg-green-100 text-green-800 border-green-500" : store === worst ? "bg-red-100 text-red-800 border-red-500" : "bg-muted text-muted-foreground";
  const formatPrice = (price?: number) => price || price === 0 ? `R$ ${price.toFixed(2)}` : "-";
  const toggleStore = (s: 'italo' | 'marcon' | 'alfa') => setSelectedStores(prev => ({ ...prev, [s]: !prev[s] }));
  const isAnyLoading = loadingItalo || loadingMarcon || loadingAlfa || comparing;
  const getMatchBadge = (type: string) => {
    switch(type) {
      case 'gtin': return <Badge variant="default" className="bg-green-600">GTIN</Badge>;
      case 'description': return <Badge variant="secondary" className="bg-blue-600 text-white">Desc</Badge>;
      case 'semantic': return <Badge variant="secondary" className="bg-purple-600 text-white">AI</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const unmatchedByStore = {
    italo: unmatchedProducts.filter(p => p.store === 'italo'),
    marcon: unmatchedProducts.filter(p => p.store === 'marcon'),
    alfa: unmatchedProducts.filter(p => p.store === 'alfa')
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-4"><Link to="/"><Button variant="ghost" className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar</Button></Link></div>
      <div className="mb-8"><h1 className="text-4xl font-bold mb-2">Comparador de Produtos</h1><p className="text-muted-foreground">Comparação por GTIN, descrição e IA semântica</p></div>

      <Card className="p-6 mb-6 bg-green-50/50">
        <h2 className="text-xl font-semibold mb-4">1. Carregar Produtos</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Checkbox id="sel-italo" checked={selectedStores.italo} onCheckedChange={() => toggleStore('italo')} /><Label htmlFor="sel-italo">Ítalo</Label></div><Badge variant="outline">{allProducts.italo.length}</Badge></div>
            {loadingItalo && <Progress value={italoProgress} className="h-2" />}
            <Button onClick={loadItaloProducts} disabled={isAnyLoading} className="w-full bg-green-600 hover:bg-green-700">{loadingItalo ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{italoProgress.toFixed(0)}%</> : allProducts.italo.length > 0 ? "Recarregar" : "Carregar"}</Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Checkbox id="sel-alfa" checked={selectedStores.alfa} onCheckedChange={() => toggleStore('alfa')} /><Label htmlFor="sel-alfa">Alfa</Label></div><Badge variant="outline">{allProducts.alfa.length}</Badge></div>
            <Button onClick={loadAlfaProducts} disabled={isAnyLoading} className="w-full bg-green-600 hover:bg-green-700">{loadingAlfa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{allProducts.alfa.length > 0 ? "Recarregar" : "Carregar"}</Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Checkbox id="sel-marcon" checked={selectedStores.marcon} onCheckedChange={() => toggleStore('marcon')} /><Label htmlFor="sel-marcon">Marcon</Label></div><Badge variant="outline">{allProducts.marcon.length}</Badge></div>
            <Button onClick={loadMarconProducts} disabled={isAnyLoading} className="w-full bg-green-600 hover:bg-green-700">{loadingMarcon ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{allProducts.marcon.length > 0 ? "Recarregar" : "Carregar"}</Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6 bg-green-50/50">
        <h2 className="text-xl font-semibold mb-4">2. Comparar</h2>
        <div className="flex items-center gap-4 mb-4">
          <Switch id="semantic-ai" checked={useSemanticAI} onCheckedChange={setUseSemanticAI} />
          <Label htmlFor="semantic-ai" className="cursor-pointer">
            Usar IA Semântica (Gemini) - comparação mais inteligente
          </Label>
        </div>
        <Button onClick={handleCompare} disabled={isAnyLoading} size="lg" className="w-full bg-green-500 hover:bg-green-600 py-6">{comparing ? <><Loader2 className="h-5 w-5 animate-spin mr-2" />Comparando...</> : <><ArrowLeftRight className="h-5 w-5 mr-2" />Comparar (GTIN + Descrição{useSemanticAI ? " + IA" : ""})</>}</Button>
      </Card>

      {stats.totalMatches === 0 && !comparing ? <Card className="p-12 border-2 border-dashed bg-green-50/30"><p className="text-center text-muted-foreground">Carregue produtos para comparar</p></Card> : <>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
          <Card className="p-4"><div className="text-sm text-muted-foreground mb-1">Total</div><div className="text-2xl font-bold">{stats.totalMatches}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground mb-1">GTIN</div><div className="text-2xl font-bold text-green-600">{stats.gtinMatches}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground mb-1">Descrição</div><div className="text-2xl font-bold text-blue-600">{stats.descriptionMatches}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground mb-1">Semântico</div><div className="text-2xl font-bold text-purple-600">{stats.semanticMatches || 0}</div></Card>
          <Card className="p-4 bg-amber-50"><div className="text-sm text-muted-foreground mb-1">Não Comparados</div><div className="text-2xl font-bold text-amber-600">{stats.unmatchedCount || 0}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground mb-1">Italo</div><div className="text-2xl font-bold text-purple-600">{stats.italoBest}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground mb-1">Marcon</div><div className="text-2xl font-bold text-orange-600">{stats.marconBest}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground mb-1">Alfa</div><div className="text-2xl font-bold text-cyan-600">{stats.alfaBest}</div></Card>
        </div>

        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Exportar Excel</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2"><Label>Dados para exportar</Label><Select value={exportStore} onValueChange={setExportStore}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="best">Melhor Preço</SelectItem><SelectItem value="italo">Italo</SelectItem><SelectItem value="marcon">Marcon</SelectItem><SelectItem value="alfa">Alfa</SelectItem></SelectContent></Select></div>
            <Button onClick={handleExportExcel} className="gap-2"><Download className="h-4 w-4" />Exportar Comparados</Button>
            {unmatchedProducts.length > 0 && (
              <Button onClick={handleExportUnmatched} variant="outline" className="gap-2">
                <AlertTriangle className="h-4 w-4" />Exportar Não Comparados ({unmatchedProducts.length})
              </Button>
            )}
          </div>
        </Card>

        <Tabs defaultValue="compared" className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="compared">Comparados ({comparedProducts.length})</TabsTrigger>
            <TabsTrigger value="unmatched">Não Comparados ({unmatchedProducts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="compared">
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4">Produtos Comparados ({comparedProducts.length})</h3>
              <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b"><th className="text-left p-3">Produto</th><th className="text-center p-3">GTIN</th><th className="text-center p-3">Tipo</th>{selectedStores.italo && <th className="text-center p-3">Italo</th>}{selectedStores.alfa && <th className="text-center p-3">Alfa</th>}{selectedStores.marcon && <th className="text-center p-3">Marcon</th>}</tr></thead>
              <tbody>{comparedProducts.map((p, i) => <tr key={i} className="border-b hover:bg-muted/50">
                <td className="p-3"><div className="font-medium">{p.name}</div><Badge variant="outline" className="mt-1">Melhor: {p.bestStore}</Badge>{p.matchScore && <span className="text-xs text-muted-foreground ml-2">({(p.matchScore * 100).toFixed(0)}%)</span>}</td>
                <td className="p-3 text-center"><code className="text-xs bg-muted px-2 py-1 rounded">{p.gtin.startsWith('DESC-') || p.gtin.startsWith('SEM-') ? '-' : p.gtin}</code></td>
                <td className="p-3 text-center">{getMatchBadge(p.matchType)}</td>
                {selectedStores.italo && <td className="p-3 text-center">{p.italo ? <Card className={`p-2 border-2 ${getPriceColor("italo", p.bestStore, p.worstStore)}`}><div className="font-semibold">{formatPrice(p.italo.price)}</div></Card> : <div className="text-muted-foreground">-</div>}</td>}
                {selectedStores.alfa && <td className="p-3 text-center">{p.alfa ? <Card className={`p-2 border-2 ${getPriceColor("alfa", p.bestStore, p.worstStore)}`}><div className="font-semibold">{formatPrice(p.alfa.price)}</div></Card> : <div className="text-muted-foreground">-</div>}</td>}
                {selectedStores.marcon && <td className="p-3 text-center">{p.marcon ? <Card className={`p-2 border-2 ${getPriceColor("marcon", p.bestStore, p.worstStore)}`}><div className="font-semibold">{formatPrice(p.marcon.price)}</div></Card> : <div className="text-muted-foreground">-</div>}</td>}
              </tr>)}</tbody></table></div>
            </Card>
          </TabsContent>

          <TabsContent value="unmatched">
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Produtos Não Comparados ({unmatchedProducts.length})
              </h3>
              <p className="text-muted-foreground mb-4">
                Produtos que não foram encontrados correspondentes em outras lojas (nem por GTIN nem por descrição).
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="p-4 border-purple-200 bg-purple-50">
                  <div className="font-semibold text-purple-800">Italo</div>
                  <div className="text-2xl font-bold text-purple-600">{unmatchedByStore.italo.length}</div>
                </Card>
                <Card className="p-4 border-orange-200 bg-orange-50">
                  <div className="font-semibold text-orange-800">Marcon</div>
                  <div className="text-2xl font-bold text-orange-600">{unmatchedByStore.marcon.length}</div>
                </Card>
                <Card className="p-4 border-cyan-200 bg-cyan-50">
                  <div className="font-semibold text-cyan-800">Alfa</div>
                  <div className="text-2xl font-bold text-cyan-600">{unmatchedByStore.alfa.length}</div>
                </Card>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">Produto</th>
                      <th className="text-center p-3">GTIN</th>
                      <th className="text-center p-3">Preço</th>
                      <th className="text-center p-3">Loja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedProducts.slice(0, 100).map((p, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 text-center">
                          <code className="text-xs bg-muted px-2 py-1 rounded">{p.gtin || '-'}</code>
                        </td>
                        <td className="p-3 text-center">{p.price ? `R$ ${p.price.toFixed(2)}` : '-'}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className={
                            p.store === 'italo' ? 'border-purple-500 text-purple-700' :
                            p.store === 'marcon' ? 'border-orange-500 text-orange-700' :
                            'border-cyan-500 text-cyan-700'
                          }>
                            {p.store.charAt(0).toUpperCase() + p.store.slice(1)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {unmatchedProducts.length > 100 && (
                  <p className="text-center text-muted-foreground py-4">
                    Mostrando 100 de {unmatchedProducts.length} produtos. Exporte para ver todos.
                  </p>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </>}
    </div>
  );
}
