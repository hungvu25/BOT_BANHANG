import { Injectable } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import { EnvService } from "../../../shared/env.service";

@Injectable()
export class BClientService {
  private readonly http: AxiosInstance;

  constructor(private readonly envService: EnvService) {
    this.http = axios.create({
      baseURL: this.envService.values.B_BASE_URL,
      timeout: 15000,
      headers: {
        "X-API-Key": this.envService.values.B_API_KEY,
        "Content-Type": "application/json",
      },
    });
  }

  async getProducts() {
    const response = await this.withSafeRequest(() => this.http.get("/api/products"));
    return response.data;
  }

  async getBalance() {
    const response = await this.withSafeRequest(() => this.http.get("/api/balance"));
    return response.data;
  }

  async buyProduct(productId: number, quantity: number) {
    const payload = {
      product_id: productId,
      quantity,
      currency: "vnd",
    };
    const response = await this.withSafeRequest(() => this.http.post("/api/buy", payload));
    return { payload, data: response.data };
  }

  async getOrders() {
    const response = await this.withSafeRequest(() => this.http.get("/api/orders"));
    return response.data;
  }

  private async withSafeRequest<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const details = JSON.stringify(error.response?.data ?? {});
        throw new Error(`B API request failed: ${error.message}. ${details}`);
      }
      throw error;
    }
  }
}
