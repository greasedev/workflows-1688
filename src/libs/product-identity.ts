import type { Product } from "../models/types";

const JINRITEMAI_DOMAIN = "jinritemai.com";

export function isJinritemaiUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === JINRITEMAI_DOMAIN || hostname.endsWith(`.${JINRITEMAI_DOMAIN}`);
  } catch {
    return false;
  }
}

export function productMatchKey(
  product: Pick<Product, "name" | "spec" | "url">,
): string {
  if (isJinritemaiUrl(product.url)) {
    return product.url;
  }
  return `${product.url}\u0000${product.name}\u0000${product.spec}`;
}

export function compareProductsByRecency(a: Product, b: Product): number {
  const aUpdatedAt = new Date(a.updatedAt ?? 0).getTime();
  const bUpdatedAt = new Date(b.updatedAt ?? 0).getTime();
  const normalizedATime = Number.isFinite(aUpdatedAt) ? aUpdatedAt : 0;
  const normalizedBTime = Number.isFinite(bUpdatedAt) ? bUpdatedAt : 0;
  return normalizedBTime - normalizedATime || (b.id ?? 0) - (a.id ?? 0);
}
