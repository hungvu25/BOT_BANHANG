export type OrderProcessStatus =
  | "NEW"
  | "BUYING"
  | "UPLOADING"
  | "DONE"
  | "FAILED";

export interface ProductMapping {
  id: string;
  aProductId: string;
  aVariantId: string;
  bProductId: number;
  outputTemplate: string;
  enabled: boolean;
}

export interface ParsedOrder {
  orderId: string;
  productId: string;
  variantId: string;
  quantity: number;
}

export interface BoughtCredential {
  content: string;
}
