import { Module } from "@nestjs/common";
import { IntegrationModule } from "../integrations/integration.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [IntegrationModule],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
