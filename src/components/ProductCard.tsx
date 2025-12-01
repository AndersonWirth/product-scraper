import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

interface ProductCardProps {
  product: any;
  storeType: "italo" | "marcon" | "alfa";
}

export const ProductCard = ({ product, storeType }: ProductCardProps) => {
  const normalizePrice = (value: any) => {
    if (!value) return 0;
    return Number(
      String(value)
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim()
    );
  };

  const formatPrice = (value: any) => {
    if (!value && value !== 0) return "R$ 0,00";
    return String(value).includes("R$")
      ? String(value)
      : `R$ ${value}`;
  };

  // ===========================================================
  // RENDER ITALO
  // ===========================================================

  const renderItaloProduct = () => (
    <>
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
        {product.image || product.thumb ? (
          <img
            src={product.image || product.thumb}
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

        {/* GTIN do Italo */}
        {product.gtin && (
          <p className="text-xs text-muted-foreground mb-2">
            GTIN: <span className="font-medium text-foreground">{product.gtin}</span>
          </p>
        )}

        <div className="flex items-baseline gap-2 flex-wrap">
          {product.special ? (
            <>
              {/* Preço especial */}
              <span className="text-2xl font-bold text-secondary">
                {formatPrice(product.special)}
              </span>

              {/* Preço original só se for diferente */}
              {normalizePrice(product.price) !== normalizePrice(product.special) && (
                <span className="text-sm line-through text-muted-foreground">
                  {formatPrice(product.price)}
                </span>
              )}

              {/* Badge de desconto */}
              {product.discount && (
                <Badge className="bg-warning text-warning-foreground font-bold">
                  -{product.discount}%
                </Badge>
              )}
            </>
          ) : (
            /* Sem special */
            <span className="text-2xl font-bold text-primary">
              {formatPrice(product.price)}
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

  // ===========================================================
  // RENDER MARCON / ALFA
  // ===========================================================

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

      <CardContent className="flex-1 p-4 space-y-3">
        <div>
          {(product.brand || product.brandName) && (
            <Badge variant="secondary" className="mb-2 text-xs">
              {product.brand || product.brandName}
            </Badge>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold">
            {product.name || "Sem nome"}
          </h3>
          {product.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
              {product.description}
            </p>
          )}

          {/* GTIN - MOSTRA TUDO */}
          {String(product.gtin || "").trim() && (
            <p className="text-xs text-muted-foreground mt-1">
              GTIN: <span className="font-medium text-foreground">{product.gtin}</span>
            </p>
          )}
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          {(product.promotionalPrice || product.pricing?.promotionalPrice) ? (
            <>
              {/* Preço promocional */}
              <span className="text-2xl font-bold text-secondary">
                {formatPrice((product.promotionalPrice || product.pricing?.promotionalPrice)?.toFixed?.(2) || product.promotionalPrice || product.pricing?.promotionalPrice)}
              </span>

              {/* Preço original — só se for diferente */}
              {normalizePrice(product.price || product.pricing?.price) !==
                normalizePrice(product.promotionalPrice || product.pricing?.promotionalPrice) && (
                  <span className="text-sm line-through text-muted-foreground">
                    {formatPrice((product.price || product.pricing?.price)?.toFixed?.(2) || product.price || product.pricing?.price)}
                  </span>
                )}

              {/* Badge de desconto */}
              {(product.discount || product.pricing?.discount) && (product.discount || product.pricing?.discount) > 0 && (
                <Badge className="bg-warning text-warning-foreground font-bold">
                  -{product.discount || product.pricing?.discount}%
                </Badge>
              )}
            </>
          ) : (
            <span className="text-2xl font-bold text-primary">
              {formatPrice((product.price || product.pricing?.price)?.toFixed?.(2) || product.price || product.pricing?.price)}
            </span>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground border-t pt-2">
          {(product.stock !== undefined || product.quantity?.inStock !== undefined) && (
            <div>
              Em estoque:{" "}
              <span className="font-medium text-foreground">
                {(product.stock || product.quantity?.inStock)?.toFixed?.(2) || product.stock || product.quantity?.inStock} {product.salesUnit || product.saleUnit || "UN"}
              </span>
            </div>
          )}

          {((product.minQuantity !== undefined || product.quantity?.min !== undefined) ||
            (product.maxQuantity !== undefined || product.quantity?.max !== undefined)) && (
              <div className="flex gap-2">
                {(product.minQuantity !== undefined || product.quantity?.min !== undefined) && (
                  <span>
                    Mín: {product.minQuantity || product.quantity?.min} {product.salesUnit || product.saleUnit || "UN"}
                  </span>
                )}
                {(product.maxQuantity !== undefined || product.quantity?.max !== undefined) && (
                  <span>
                    • Máx: {product.maxQuantity || product.quantity?.max} {product.salesUnit || product.saleUnit || "UN"}
                  </span>
                )}
              </div>
            )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {(product.inPromotion || product.pricing?.promotion) && (
            <Badge variant="default" className="text-xs">
              Em Promoção
            </Badge>
          )}

          {(product.salesCount || 0) > 0 && (
            <Badge variant="outline" className="text-xs">
              {product.salesCount} vendas
            </Badge>
          )}

          {((product.stock || product.quantity?.inStock || 0) < 10 && (product.stock || product.quantity?.inStock || 0) > 0) && (
            <Badge variant="destructive" className="text-xs">
              Estoque Baixo
            </Badge>
          )}
        </div>

        {(product.promotionActive || product.promotions?.active) && (product.promotionName || product.promotions?.promotionName) && (
          <div className="border-t pt-2 space-y-1">
            <Badge variant="secondary" className="text-xs">
              {product.promotionName || product.promotions?.promotionName}
            </Badge>
            {(product.promotionType || product.promotions?.promotionType) && (
              <p className="text-xs text-muted-foreground">
                Tipo: {product.promotionType || product.promotions?.promotionType}
              </p>
            )}
            {((product.startDate || product.promotions?.startDate) || (product.endDate || product.promotions?.endDate)) && (
              <p className="text-xs text-muted-foreground">
                {(product.startDate || product.promotions?.startDate) &&
                  `De ${new Date(product.startDate || product.promotions?.startDate).toLocaleDateString("pt-BR")}`}
                {(product.endDate || product.promotions?.endDate) &&
                  ` até ${new Date(product.endDate || product.promotions?.endDate).toLocaleDateString("pt-BR")}`}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </>
  );

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg flex flex-col">
      {storeType === "italo"
        ? renderItaloProduct()
        : renderMarconAlfaProduct()}
    </Card>
  );
};