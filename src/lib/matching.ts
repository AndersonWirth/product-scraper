import stringSimilarity from "string-similarity";

export interface Product {
  id: string;
  name: string;
  price: number;
  promotionalPrice?: number;
  store: string;
}

export interface MatchResult {
  productA: string;
  productB: string;
  score: number;
  isMatch: boolean;
}

export interface BestMatch {
  name: string;
  score: number;
  product: Product;
}

export interface ComparisonResult {
  sourceProduct: Product;
  matches: {
    store: string;
    bestMatch: BestMatch | null;
  }[];
  bestOverall: {
    store: string;
    product: Product;
    score: number;
  } | null;
}

export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compareProducts(a: string, b: string): MatchResult {
  const score = stringSimilarity.compareTwoStrings(
    normalize(a),
    normalize(b)
  );

  return {
    productA: a,
    productB: b,
    score,
    isMatch: score >= 0.85,
  };
}

export function findBestMatch(
  product: string, 
  list: Product[]
): BestMatch | null {
  if (list.length === 0) return null;

  const results = list.map(item => ({
    name: item.name,
    score: stringSimilarity.compareTwoStrings(
      normalize(product),
      normalize(item.name)
    ),
    product: item
  }));

  results.sort((a, b) => b.score - a.score);

  return results[0].score >= 0.85 ? results[0] : null;
}

export function compareProductAcrossStores(
  sourceProduct: Product,
  storeProducts: { store: string; products: Product[] }[]
): ComparisonResult {
  const matches = storeProducts.map(({ store, products }) => ({
    store,
    bestMatch: findBestMatch(sourceProduct.name, products)
  }));

  const validMatches = matches
    .filter(m => m.bestMatch !== null)
    .map(m => ({
      store: m.store,
      product: m.bestMatch!.product,
      score: m.bestMatch!.score
    }));

  const bestOverall = validMatches.length > 0
    ? validMatches.sort((a, b) => b.score - a.score)[0]
    : null;

  return {
    sourceProduct,
    matches,
    bestOverall
  };
}
