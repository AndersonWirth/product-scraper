import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export interface RequestConfigData {
  id: string;
  search: string;
  categoryId: string;
  promotion: boolean;
  limit: number;
  sortField: string;
  sortOrder: string;
}

interface RequestConfigProps {
  config: RequestConfigData;
  index: number;
  onChange: (id: string, field: string, value: any) => void;
  onRemove: (id: string) => void;
  showRemove: boolean;
}

export const RequestConfig = ({ config, index, onChange, onRemove, showRemove }: RequestConfigProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Requisição #{index + 1}</CardTitle>
        {showRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(config.id)}
            className="h-8 w-8"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`search-${config.id}`}>Pesquisa</Label>
            <Input
              id={`search-${config.id}`}
              placeholder="Digite o termo de busca..."
              value={config.search}
              onChange={(e) => onChange(config.id, "search", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`category-${config.id}`}>ID da Categoria</Label>
            <Input
              id={`category-${config.id}`}
              placeholder="Ex: 123 (opcional)"
              value={config.categoryId}
              onChange={(e) => onChange(config.id, "categoryId", e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor={`promotion-${config.id}`}>Apenas Promoções</Label>
            <Switch
              id={`promotion-${config.id}`}
              checked={config.promotion}
              onCheckedChange={(checked) => onChange(config.id, "promotion", checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`limit-${config.id}`}>Limite</Label>
            <Input
              id={`limit-${config.id}`}
              type="number"
              min="1"
              max="200"
              value={config.limit}
              onChange={(e) => onChange(config.id, "limit", parseInt(e.target.value) || 50)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`sortField-${config.id}`}>Ordenar por</Label>
            <Select
              value={config.sortField}
              onValueChange={(value) => onChange(config.id, "sortField", value)}
            >
              <SelectTrigger id={`sortField-${config.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales_count">Vendas</SelectItem>
                <SelectItem value="name">Nome</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sortOrder-${config.id}`}>Ordem</Label>
          <Select
            value={config.sortOrder}
            onValueChange={(value) => onChange(config.id, "sortOrder", value)}
          >
            <SelectTrigger id={`sortOrder-${config.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Crescente</SelectItem>
              <SelectItem value="desc">Decrescente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
