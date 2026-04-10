import { Module } from "@nestjs/common";
import { AClientService } from "./services/a-client.service";
import { BClientService } from "./services/b-client.service";

@Module({
  providers: [AClientService, BClientService],
  exports: [AClientService, BClientService],
})
export class IntegrationModule {}
