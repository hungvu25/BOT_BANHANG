import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule } from "../shared/config.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { IntegrationModule } from "./integrations/integration.module";
import { OrdersModule } from "./orders/orders.module";
import { SecurityModule } from "./security/security.module";

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    SecurityModule,
    IntegrationModule,
    OrdersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
