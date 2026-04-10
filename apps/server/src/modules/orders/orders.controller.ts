import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get("events")
  listOrderEvents() {
    return this.ordersService.listOrderEvents();
  }

  @Get("status")
  getStatus() {
    return this.ordersService.getDashboardStatus();
  }

  @Get("mappings")
  listMappings() {
    return this.ordersService.listMappings();
  }

  @Get("b-products")
  listBProducts() {
    return this.ordersService.listBProducts();
  }

  @Get("a-orders")
  listAOrders() {
    return this.ordersService.listAOrders();
  }

  @Post("mappings")
  upsertMapping(
    @Body()
    body: {
      aProductId: string;
      aVariantId: string;
      bProductId: number;
      outputTemplate?: string;
      enabled?: boolean;
    },
  ) {
    return this.ordersService.upsertMapping(body);
  }

  @Post("test-upload")
  testUpload(
    @Body()
    body: {
      productId: string;
      variantId: string;
      content: string;
    },
  ) {
    return this.ordersService.testUploadInventory(body);
  }

  @Post("seller-token")
  updateSellerToken(
    @Body()
    body: {
      token?: string;
      curl?: string;
    },
  ) {
    return this.ordersService.updateSellerToken(body);
  }

  @Post("events/:aOrderId/reprocess")
  reprocess(@Param("aOrderId") aOrderId: string) {
    return this.ordersService.reprocess(aOrderId);
  }
}
