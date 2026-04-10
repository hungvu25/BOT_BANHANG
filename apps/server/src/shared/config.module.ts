import { Global, Module } from "@nestjs/common";
import { config } from "dotenv";
import { z } from "zod";
import { EnvService } from "./env.service";

config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  A_BASE_URL: z.string().default("https://datammo.com"),
  A_API_KEY: z.string().min(1),
  A_SELLER_TOKEN: z.string().optional(),
  A_SELLER_COOKIE: z.string().optional(),
  A_HTTP_USER_AGENT: z.string().optional(),
  A_SALES_LIMIT: z.string().default("50"),
  A_SALES_PRODUCT_TYPE: z.string().default("DIGITAL"),
  B_BASE_URL: z.string().default("http://tunvnmmo.duckdns.org"),
  B_API_KEY: z.string().min(1),
  POLL_INTERVAL_MS: z.string().default("5000"),
  MAX_RETRIES: z.string().default("3"),
  CONCURRENCY: z.string().default("1"),
  ADMIN_ORIGIN: z.string().default("http://localhost:5173"),
  AUTO_PROCESS_ORDERS: z.string().default("false"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TOKEN_EXPIRY_ALERT_HOURS: z.string().default("24,6,1"),
});

@Global()
@Module({
  providers: [
    {
      provide: "ENV",
      useFactory: () => envSchema.parse(process.env),
    },
    EnvService,
  ],
  exports: ["ENV", EnvService],
})
export class ConfigModule {}
