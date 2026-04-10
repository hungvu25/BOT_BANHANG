import { Inject, Injectable } from "@nestjs/common";

type EnvMap = {
  PORT: string;
  DATABASE_URL: string;
  A_BASE_URL: string;
  A_API_KEY: string;
  A_SELLER_TOKEN?: string;
  A_SELLER_COOKIE?: string;
  A_HTTP_USER_AGENT?: string;
  A_SALES_LIMIT: string;
  A_SALES_PRODUCT_TYPE: string;
  B_BASE_URL: string;
  B_API_KEY: string;
  POLL_INTERVAL_MS: string;
  MAX_RETRIES: string;
  CONCURRENCY: string;
  ADMIN_ORIGIN: string;
  AUTO_PROCESS_ORDERS: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TOKEN_EXPIRY_ALERT_HOURS: string;
};

@Injectable()
export class EnvService {
  constructor(@Inject("ENV") private readonly env: EnvMap) {}

  get values() {
    return this.env;
  }
}
