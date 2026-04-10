import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { AClientService } from "../integrations/services/a-client.service";
import { BClientService } from "../integrations/services/b-client.service";
import { PrismaService } from "../prisma/prisma.service";
import { EnvService } from "../../shared/env.service";
import { TokenSecurityService } from "../security/token-security.service";

const CURSOR_KEY = "orders_cursor";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private isRunning = false;
  private lastPollAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aClient: AClientService,
    private readonly bClient: BClientService,
    private readonly envService: EnvService,
    private readonly tokenSecurityService: TokenSecurityService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async pollOrders() {
    if (this.envService.values.AUTO_PROCESS_ORDERS !== "true") return;
    if (this.isRunning) return;
    const pollIntervalMs = Number(this.envService.values.POLL_INTERVAL_MS);
    const now = Date.now();
    if (now - this.lastPollAt < pollIntervalMs) return;

    this.isRunning = true;
    this.lastPollAt = now;

    try {
      const cursorSetting = await this.prisma.systemSetting.findUnique({
        where: { key: CURSOR_KEY },
      });
      const cursor = cursorSetting?.value;
      const { orders, nextCursor } = await this.aClient.getNewOrders(cursor);

      const concurrency = Math.max(1, Number(this.envService.values.CONCURRENCY));
      for (let i = 0; i < orders.length; i += concurrency) {
        const chunk = orders.slice(i, i + concurrency);
        await Promise.all(chunk.map((order) => this.handleOrder(order)));
      }

      if (nextCursor) {
        await this.prisma.systemSetting.upsert({
          where: { key: CURSOR_KEY },
          create: { key: CURSOR_KEY, value: nextCursor },
          update: { value: nextCursor },
        });
      }
    } catch (error) {
      this.logger.error("Polling failed", error instanceof Error ? error.stack : undefined);
    } finally {
      this.isRunning = false;
    }
  }

  async handleOrder(order: {
    orderId: string;
    productId: string;
    variantId: string;
    quantity: number;
  }) {
    const existing = await this.prisma.orderEvent.findUnique({
      where: { aOrderId: order.orderId },
    });
    if (existing?.status === "DONE" || existing?.lockedAt) return;

    await this.prisma.orderEvent.upsert({
      where: { aOrderId: order.orderId },
      create: {
        aOrderId: order.orderId,
        status: "NEW",
        payload: JSON.stringify(order),
        lockedAt: new Date(),
      },
      update: {
        payload: JSON.stringify(order),
        lockedAt: new Date(),
      },
    });

    const mapping = await this.prisma.productMapping.findUnique({
      where: {
        aProductId_aVariantId: {
          aProductId: order.productId,
          aVariantId: order.variantId,
        },
      },
    });

    if (!mapping || !mapping.enabled) {
      await this.markFailed(order.orderId, "No active mapping found");
      return;
    }

    const maxRetries = Number(this.envService.values.MAX_RETRIES);
    const event = await this.prisma.orderEvent.findUnique({ where: { aOrderId: order.orderId } });
    if (!event) return;
    if (event.retries >= maxRetries) {
      await this.markFailed(order.orderId, "Retry limit reached");
      return;
    }

    try {
      await this.prisma.orderEvent.update({
        where: { aOrderId: order.orderId },
        data: { status: "BUYING", retries: { increment: 1 }, lastError: null },
      });

      const buyResult = await this.bClient.buyProduct(mapping.bProductId, order.quantity);
      await this.prisma.purchaseLog.create({
        data: {
          aOrderId: order.orderId,
          requestBody: JSON.stringify(buyResult.payload),
          responseRaw: JSON.stringify(buyResult.data),
          success: true,
        },
      });

      const content = this.normalizeBoughtData(buyResult.data, mapping.outputTemplate);

      await this.prisma.orderEvent.update({
        where: { aOrderId: order.orderId },
        data: { status: "UPLOADING" },
      });

      const uploadResp = await this.aClient.uploadInventory(order.productId, order.variantId, content);
      await this.prisma.deliveryLog.create({
        data: {
          aOrderId: order.orderId,
          requestBody: JSON.stringify({ productId: order.productId, variantId: order.variantId, content }),
          responseRaw: JSON.stringify(uploadResp.data),
          success: true,
        },
      });

      await this.prisma.orderEvent.update({
        where: { aOrderId: order.orderId },
        data: { status: "DONE", lockedAt: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error";
      const backoffMs = Math.min(30000, 1000 * Math.pow(2, event.retries));
      await this.markFailed(order.orderId, `${message} | backoff=${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    } finally {
      await this.prisma.orderEvent.update({
        where: { aOrderId: order.orderId },
        data: { lockedAt: null },
      });
    }
  }

  normalizeBoughtData(raw: any, outputTemplate: string): string {
    if (typeof raw?.data?.content === "string") {
      return outputTemplate.replace("{{account}}", raw.data.content);
    }

    if (Array.isArray(raw?.data?.accounts)) {
      const lines = raw.data.accounts.map((acc: any) => {
        if (typeof acc === "string") return acc;
        if (acc?.email && acc?.password) return `${acc.email}|${acc.password}`;
        return JSON.stringify(acc);
      });
      return lines.join("\n");
    }

    return outputTemplate.replace("{{account}}", JSON.stringify(raw));
  }

  async markFailed(aOrderId: string, message: string) {
    await this.prisma.orderEvent.update({
      where: { aOrderId },
      data: { status: "FAILED", lastError: message, lockedAt: null },
    });
  }

  async listOrderEvents() {
    return this.prisma.orderEvent.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async getDashboardStatus() {
    const [recentEvents, failedCount, doneCount, bBalance, sellerTokenStatus] = await Promise.all([
      this.prisma.orderEvent.findMany({
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      this.prisma.orderEvent.count({ where: { status: "FAILED" } }),
      this.prisma.orderEvent.count({ where: { status: "DONE" } }),
      this.bClient.getBalance().catch(() => null),
      this.tokenSecurityService.getTokenStatus(),
    ]);

    return {
      running: this.isRunning,
      pollIntervalMs: Number(this.envService.values.POLL_INTERVAL_MS),
      doneCount,
      failedCount,
      bBalance,
      recentEvents,
      sellerTokenStatus,
    };
  }

  async listMappings() {
    return this.prisma.productMapping.findMany({ orderBy: { updatedAt: "desc" } });
  }

  async listBProducts() {
    return this.bClient.getProducts();
  }

  async listAOrders() {
    const { orders } = await this.aClient.getOrdersRaw();
    return orders;
  }

  async testUploadInventory(payload: {
    productId: string;
    variantId: string;
    content: string;
  }) {
    const response = await this.aClient.uploadInventory(
      payload.productId,
      payload.variantId,
      payload.content,
    );

    return {
      ok: true,
      request: payload,
      response: response.data,
    };
  }

  async updateSellerToken(body: { token?: string; curl?: string }) {
    if (body.curl?.trim()) {
      try {
        return await this.tokenSecurityService.applyFromCurl(body.curl.trim(), "api");
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : "Invalid curl");
      }
    }
    if (body.token?.trim()) {
      await this.tokenSecurityService.setSellerToken(body.token.trim(), "api");
      return this.tokenSecurityService.getTokenStatus();
    }
    throw new BadRequestException("Can thiet token hoac curl (Copy as cURL).");
  }

  async upsertMapping(payload: {
    aProductId: string;
    aVariantId: string;
    bProductId: number;
    outputTemplate?: string;
    enabled?: boolean;
  }) {
    const data: Prisma.ProductMappingUncheckedCreateInput = {
      aProductId: payload.aProductId,
      aVariantId: payload.aVariantId,
      bProductId: payload.bProductId,
      outputTemplate: payload.outputTemplate ?? "{{account}}",
      enabled: payload.enabled ?? true,
    };

    return this.prisma.productMapping.upsert({
      where: {
        aProductId_aVariantId: {
          aProductId: payload.aProductId,
          aVariantId: payload.aVariantId,
        },
      },
      create: data,
      update: data,
    });
  }

  async reprocess(aOrderId: string) {
    const event = await this.prisma.orderEvent.findUnique({ where: { aOrderId } });
    if (!event?.payload) {
      throw new Error("Order payload not found");
    }

    await this.prisma.orderEvent.update({
      where: { aOrderId },
      data: { status: "NEW", lastError: null },
    });

    const order = JSON.parse(event.payload) as {
      orderId: string;
      productId: string;
      variantId: string;
      quantity: number;
    };
    await this.handleOrder(order);
    return { ok: true };
  }
}
