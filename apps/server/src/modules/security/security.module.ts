import { Global, Module } from "@nestjs/common";
import { TokenSecurityService } from "./token-security.service";

@Global()
@Module({
  providers: [TokenSecurityService],
  exports: [TokenSecurityService],
})
export class SecurityModule {}
