import { Injectable } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import { EnvService } from "../../../shared/env.service";
import { TokenSecurityService } from "../../security/token-security.service";

export interface AOrderItem {
  orderId: string;
  productId: string;
  variantId: string;
  quantity: number;
}

export interface AOrderRaw {
  id: string;
  productId?: string;
  variantId?: string;
  quantity?: number;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

const DEFAULT_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

@Injectable()
export class AClientService {
  private readonly http: AxiosInstance;

  constructor(
    private readonly envService: EnvService,
    private readonly tokenSecurityService: TokenSecurityService,
  ) {
    this.http = axios.create({
      baseURL: this.envService.values.A_BASE_URL,
      timeout: 15000,
    });
  }

  /** Headers giống trình duyệt — axios mặc định thường bị Cloudflare chặn. */
  private browserLikeHeaders(extra: Record<string, string>): Record<string, string> {
    let origin = "https://datammo.com";
    try {
      origin = new URL(this.envService.values.A_BASE_URL).origin;
    } catch {
      /* keep default */
    }
    const ua = this.envService.values.A_HTTP_USER_AGENT?.trim() || DEFAULT_CHROME_UA;
    return {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      "User-Agent": ua,
      Origin: origin,
      Referer: `${origin}/`,
      ...extra,
    };
  }

  async getNewOrders(cursor?: string): Promise<{ orders: AOrderItem[]; nextCursor?: string }> {
    const { orders: rawOrders, nextCursor } = await this.getOrdersRaw(cursor);
    const orders: AOrderItem[] = rawOrders.map((item: any) => ({
      orderId: String(item.id),
      productId: String(item.productId ?? item.product?.id ?? ""),
      variantId: String(item.variantId ?? item.variant?.id ?? ""),
      quantity: Number(item.quantity ?? 1),
    }));

    return {
      orders: orders.filter(
        (o, index) =>
          o.orderId &&
          o.productId &&
          o.variantId &&
          String(rawOrders[index]?.status ?? "").toUpperCase() === "PRE_ORDER",
      ),
      nextCursor,
    };
  }

  async uploadInventory(productId: string, variantId: string, content: string) {
    return this.withSafeRequest(() =>
      this.http.post(
        `/api/v1/products/${productId}/inventory`,
        {
          variantId,
          content,
        },
        {
          headers: this.browserLikeHeaders({
            Authorization: `Bearer ${this.envService.values.A_API_KEY}`,
            "Content-Type": "application/json",
          }),
        },
      ),
    );
  }

  async getOrdersRaw(cursor?: string): Promise<{ orders: AOrderRaw[]; nextCursor?: string }> {
    const sellerToken = await this.tokenSecurityService.getActiveSellerToken();
    const sellerCookie = await this.tokenSecurityService.getActiveSellerCookie();
    const curlProfile = await this.tokenSecurityService.getSellerCurlHeaders();
    const limit = Number(this.envService.values.A_SALES_LIMIT || "50");
    const productType = this.envService.values.A_SALES_PRODUCT_TYPE || "DIGITAL";

    const sellerHeaders: Record<string, string> =
      curlProfile && Object.keys(curlProfile).length > 0
        ? {
            ...curlProfile,
            authorization: `Bearer ${sellerToken}`,
            ...(sellerCookie ? { cookie: sellerCookie } : {}),
          }
        : this.browserLikeHeaders({
            Authorization: `Bearer ${sellerToken}`,
            ...(sellerCookie ? { Cookie: sellerCookie } : {}),
          });

    const response = await this.withSafeRequest(() =>
      this.http.get("/api/v1/seller/sales", {
        params: {
          limit,
          productType,
          ...(cursor ? { cursor } : {}),
        },
        headers: sellerHeaders,
      }),
    );

    const rawOrders = Array.isArray(response.data?.data) ? response.data.data : [];
    return {
      orders: rawOrders as AOrderRaw[],
      nextCursor: response.data?.meta?.nextCursor,
    };
  }

  private async withSafeRequest<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const payload = error.response?.data;
        let details = "";
        if (typeof payload === "string") {
          details = payload.toLowerCase().includes("<html")
            ? "Non-JSON HTML from upstream (Cloudflare/WAF). Neu da co cf_clearance: IP server phai trung IP luc lay cookie trong browser; cookie het han thi lay lai; co the set A_HTTP_USER_AGENT giong Chrome."
            : payload.slice(0, 500);
        } else {
          details = JSON.stringify(payload ?? {});
        }
        throw new Error(`A API request failed: ${error.message} (status=${status ?? "unknown"}). ${details}`);
      }
      throw error;
    }
  }
}
