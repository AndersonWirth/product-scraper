import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface ProductCardProps {
  product: any;
  storeType: "italo" | "marcon" | "alfa";
}

export const ProductCard = ({ product, storeType }: ProductCardProps) => {
  const renderItaloProduct = () => (
    <>
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Sem imagem
          </div>
        )}
      </div>
      
      <CardContent className="flex-1 p-4">
        <h3 className="mb-2 line-clamp-2 text-sm font-semibold">
          {product.name || "Sem nome"}
        </h3>
        
        <div className="flex items-baseline gap-2 flex-wrap">
          {product.special ? (
            <>
              <span className="text-2xl font-bold text-secondary">
                R$ {product.special}
              </span>
              <span className="text-sm line-through text-muted-foreground">
                R$ {product.price}
              </span>
              {product.discount && (
                <Badge className="bg-warning text-warning-foreground font-bold">
                  -{product.discount}%
                </Badge>
              )}
            </>
          ) : (
            <span className="text-2xl font-bold text-primary">
              R$ {product.price}
            </span>
          )}
        </div>
        
        {product.href && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => window.open(product.href, "_blank")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Ver no site
          </Button>
        )}
      </CardContent>
    </>
  );

  const renderMarconAlfaProduct = () => (
    <>
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Sem imagem
          </div>
        )}
      </div>
      
      <CardContent className="flex-1 p-4">
        <div className="mb-2">
          {product.brand && (
            <Badge variant="secondary" className="mb-2">
              {product.brand}
            </Badge>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold">
            {product.name || "Sem nome"}
          </h3>
        </div>
        
        <div className="flex items-baseline gap-2 flex-wrap mb-2">
          {product.promotionalPrice ? (
            <>
              <span className="text-2xl font-bold text-secondary">
                R$ {product.promotionalPrice.toFixed(2)}
              </span>
              <span className="text-sm line-through text-muted-foreground">
                R$ {product.price.toFixed(2)}
              </span>
              {product.discount && product.discount > 0 && (
                <Badge className="bg-warning text-warning-foreground font-bold">
                  -{product.discount}%
                </Badge>
              )}
            </>
          ) : (
            <span className="text-2xl font-bold text-primary">
              R$ {product.price.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex gap-2 text-xs text-muted-foreground mb-2">
          <span>🛒 {product.salesCount || 0} vendas</span>
          {product.stock < 10 && (
            <Badge variant="destructive" className="text-xs">
              Estoque Baixo
            </Badge>
          )}
        </div>

        {product.promotionName && (
          <Badge variant="outline" className="text-xs">
            {product.promotionName}
          </Badge>
        )}
      </CardContent>
    </>
  );

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg flex flex-col">
      {storeType === "italo" ? renderItaloProduct() : renderMarconAlfaProduct()}
    </Card>
  );
};
