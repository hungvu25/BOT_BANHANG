import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { EnvService } from "../../shared/env.service";

const SELLER_TOKEN_KEY = "a_seller_token";
const SELLER_COOKIE_KEY = "a_seller_cookie";
const SELLER_CURL_HEADERS_KEY = "a_seller_curl_headers";
const TELEGRAM_OFFSET_KEY = "telegram_update_offset";
const TELEGRAM_LAST_CHAT_ID_KEY = "telegram_last_chat_id";
const pendingSettokenKey = (chatId: string) => `telegram_pending_settoken_${chatId}`;

@Injectable()
export class TokenSecurityService {
  private readonly logger = new Logger(TokenSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly envService: EnvService,
  ) {}

  async getActiveSellerToken(): Promise<string> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SELLER_TOKEN_KEY },
    });
    return setting?.value || this.envService.values.A_SELLER_TOKEN || this.envService.values.A_API_KEY;
  }

  async getActiveSellerCookie(): Promise<string> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SELLER_COOKIE_KEY },
    });
    return setting?.value || this.envService.values.A_SELLER_COOKIE || "";
  }

  async setSellerToken(token: string, source = "manual") {
    await this.prisma.systemSetting.upsert({
      where: { key: SELLER_TOKEN_KEY },
      create: { key: SELLER_TOKEN_KEY, value: token },
      update: { value: token },
    });

    await this.prisma.systemSetting.upsert({
      where: { key: "a_seller_token_source" },
      create: { key: "a_seller_token_source", value: source },
      update: { value: source },
    });

    await this.clearAlertFlags();
  }

  async setSellerCookie(cookie: string, source = "manual") {
    await this.prisma.systemSetting.upsert({
      where: { key: SELLER_COOKIE_KEY },
      create: { key: SELLER_COOKIE_KEY, value: cookie },
      update: { value: cookie },
    });

    await this.prisma.systemSetting.upsert({
      where: { key: "a_seller_cookie_source" },
      create: { key: "a_seller_cookie_source", value: source },
      update: { value: source },
    });
  }

  /** Luu toan bo header tu curl (DevTools) — authorization se bi ghi de khi goi API. */
  async setSellerCurlHeaders(headers: Record<string, string>, source = "manual") {
    const clone = { ...headers };
    delete clone.authorization;
    delete clone.host;

    await this.prisma.systemSetting.upsert({
      where: { key: SELLER_CURL_HEADERS_KEY },
      create: { key: SELLER_CURL_HEADERS_KEY, value: JSON.stringify(clone) },
      update: { value: JSON.stringify(clone) },
    });

    await this.prisma.systemSetting.upsert({
      where: { key: "a_seller_curl_headers_source" },
      create: { key: "a_seller_curl_headers_source", value: source },
      update: { value: source },
    });
  }

  async getSellerCurlHeaders(): Promise<Record<string, string> | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SELLER_CURL_HEADERS_KEY },
    });
    if (!row?.value) return null;
    try {
      const parsed = JSON.parse(row.value) as Record<string, string>;
      return Object.keys(parsed).length ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Import curl tu DevTools (API / admin). */
  async applyFromCurl(raw: string, source = "api") {
    const parsed = this.parseCurlCommand(raw);
    if (!parsed || Object.keys(parsed.headers).length === 0) {
      throw new Error("Khong doc duoc lenh curl hoac khong co -H header.");
    }
    const auth = parsed.headers.authorization || "";
    const bearerMatch = auth.match(/Bearer\s+(.+)/i);
    const token = bearerMatch?.[1]?.trim() || "";
    if (!token || !this.looksLikeJwt(token)) {
      throw new Error("Curl khong co Authorization Bearer JWT hop le.");
    }
    await this.setSellerToken(token, source);
    const cookie = parsed.headers.cookie || parsed.cookieBag || "";
    if (cookie) {
      await this.setSellerCookie(cookie, source);
    }
    await this.setSellerCurlHeaders(parsed.headers, source);
    return this.getTokenStatus();
  }

  async getTokenStatus() {
    const token = await this.getActiveSellerToken();
    const payload = this.decodeJwtPayload(token);
    const exp = typeof payload?.exp === "number" ? payload.exp : null;
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSeconds = exp ? exp - nowSec : null;

    return {
      hasToken: Boolean(token),
      hasCookie: Boolean(await this.getActiveSellerCookie()),
      hasCurlProfile: Boolean(await this.getSellerCurlHeaders()),
      source: (await this.prisma.systemSetting.findUnique({ where: { key: "a_seller_token_source" } }))
        ?.value ?? "env",
      exp,
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
      remainingSeconds,
      remainingHours: remainingSeconds !== null ? Number((remainingSeconds / 3600).toFixed(2)) : null,
      expired: remainingSeconds !== null ? remainingSeconds <= 0 : null,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async notifyTokenExpiry() {
    const telegramToken = this.envService.values.TELEGRAM_BOT_TOKEN;
    const telegramChatId = await this.getNotificationChatId();
    if (!telegramToken || !telegramChatId) return;

    const status = await this.getTokenStatus();
    if (!status.exp || status.remainingSeconds === null) return;

    const thresholds = (this.envService.values.TOKEN_EXPIRY_ALERT_HOURS || "24,6,1")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a);

    if (status.remainingSeconds <= 0) {
      const sentKey = `token_alert_expired_${status.exp}`;
      if (!(await this.hasFlag(sentKey))) {
        await this.sendTelegramMessage(
          `Token seller A đã hết hạn. Gửi /settoken rồi dán JWT mới trong tin nhắn tiếp theo.`,
          telegramChatId,
        );
        await this.setFlag(sentKey);
      }
      return;
    }

    const remainingHours = status.remainingSeconds / 3600;
    for (const hour of thresholds) {
      if (remainingHours <= hour) {
        const sentKey = `token_alert_${status.exp}_${hour}`;
        if (!(await this.hasFlag(sentKey))) {
          await this.sendTelegramMessage(
            `Canh bao: token seller A con ${remainingHours.toFixed(
              2,
            )} gio (moc canh bao ${hour}h).`,
            telegramChatId,
          );
          await this.setFlag(sentKey);
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async pollTelegramCommands() {
    const telegramToken = this.envService.values.TELEGRAM_BOT_TOKEN;
    if (!telegramToken) {
      this.logger.warn("Telegram poll skipped: TELEGRAM_BOT_TOKEN is empty");
      return;
    }

    try {
      const offsetSetting = await this.prisma.systemSetting.findUnique({
        where: { key: TELEGRAM_OFFSET_KEY },
      });
      const offset = offsetSetting ? Number(offsetSetting.value) : 0;
      const response = await axios.get(`https://api.telegram.org/bot${telegramToken}/getUpdates`, {
        params: { timeout: 0, offset },
      });
      const updates = Array.isArray(response.data?.result) ? response.data.result : [];
      if (!updates.length) return;

      let nextOffset = offset;
      for (const update of updates) {
        const updateId = Number(update.update_id ?? 0);
        nextOffset = Math.max(nextOffset, updateId + 1);
        const chatId = String(update.message?.chat?.id ?? "");
        const text = String(update.message?.text ?? "").trim();
        await this.handleTelegramMessage(chatId, text);
      }

      await this.prisma.systemSetting.upsert({
        where: { key: TELEGRAM_OFFSET_KEY },
        create: { key: TELEGRAM_OFFSET_KEY, value: String(nextOffset) },
        update: { value: String(nextOffset) },
      });
    } catch (error) {
      this.logger.warn(`Telegram poll failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  private async handleTelegramMessage(chatId: string, text: string) {
    if (!chatId || !text) {
      return;
    }

    await this.prisma.systemSetting.upsert({
      where: { key: TELEGRAM_LAST_CHAT_ID_KEY },
      create: { key: TELEGRAM_LAST_CHAT_ID_KEY, value: chatId },
      update: { value: chatId },
    });

    if (text === "/status") {
      const status = await this.getTokenStatus();
      await this.sendTelegramMessage(
        `Token status:\nsource=${status.source}\nexpiresAt=${status.expiresAt ?? "unknown"}\nremainingHours=${
          status.remainingHours ?? "unknown"
        }\nhasCookie=${status.hasCookie ? "yes" : "no"}\nhasCurlProfile=${status.hasCurlProfile ? "yes" : "no"}`,
        chatId,
      );
      return;
    }

    if (/^\/cancel(?:@\w+)?$/.test(text)) {
      await this.clearPendingSettoken(chatId);
      await this.sendTelegramMessage("Đã hủy cập nhật token.", chatId);
      return;
    }

    const bareSettoken = /^\/settoken(?:@\w+)?\s*$/.test(text);
    if (bareSettoken) {
      await this.setPendingSettoken(chatId);
      await this.sendTelegramMessage(
        "Hay dan o tin tiep theo: JWT, block header, hoac nguyen lenh curl tu DevTools (Copy as cURL).\nGo /cancel neu muon huy.",
        chatId,
      );
      return;
    }

    const setTokenMatch = text.match(/^\/settoken(?:@\w+)?\s+(.+)$/s);
    if (setTokenMatch?.[1]) {
      const parsed = this.extractAuthPayload(setTokenMatch[1]);
      if (parsed.curlInvalid) {
        await this.sendTelegramMessage(
          "Curl: co header nhung khong doc duoc Bearer JWT hop le. Kiem tra lai lenh Copy as cURL.",
          chatId,
        );
        return;
      }
      if (parsed.token && this.looksLikeJwt(parsed.token)) {
        await this.clearPendingSettoken(chatId);
        await this.applyNewTokenFromTelegram(chatId, parsed.token, parsed.cookie, parsed.curlHeaders);
        return;
      }
      await this.sendTelegramMessage(
        "Khong doc duoc token hop le. Gui JWT, block header, hoac lenh curl day du (Copy as cURL).",
        chatId,
      );
      return;
    }

    if (await this.isPendingSettoken(chatId)) {
      const parsed = this.extractAuthPayload(text);
      if (parsed.curlInvalid) {
        await this.sendTelegramMessage(
          "Curl: co header nhung khong doc duoc Bearer JWT hop le. Kiem tra lai lenh Copy as cURL.",
          chatId,
        );
        return;
      }
      if (parsed.token && this.looksLikeJwt(parsed.token)) {
        await this.clearPendingSettoken(chatId);
        await this.applyNewTokenFromTelegram(chatId, parsed.token, parsed.cookie, parsed.curlHeaders);
        return;
      }
      await this.sendTelegramMessage(
        "Khong doc duoc. Dan JWT, block header, hoac lenh curl (Copy as cURL). Hoac go /cancel.",
        chatId,
      );
      return;
    }
  }

  private async applyNewTokenFromTelegram(
    chatId: string,
    token: string,
    cookie?: string,
    curlHeaders?: Record<string, string>,
  ) {
    await this.setSellerToken(token, "telegram");
    if (cookie) {
      await this.setSellerCookie(cookie, "telegram");
    }
    if (curlHeaders && Object.keys(curlHeaders).length > 0) {
      await this.setSellerCurlHeaders(curlHeaders, "telegram");
    }
    const status = await this.getTokenStatus();
    const extra = curlHeaders
      ? ` Da luu profile curl (${Object.keys(curlHeaders).length} header).`
      : cookie
        ? " (token + cookie)."
        : " (token).";
    await this.sendTelegramMessage(
      `Da cap nhat auth seller A.${extra}\nHet han token: ${status.expiresAt ?? "khong ro"}\nhasCurlProfile=${
        status.hasCurlProfile ? "yes" : "no"
      }`,
      chatId,
    );
  }

  private async isPendingSettoken(chatId: string): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: pendingSettokenKey(chatId) },
    });
    return row?.value === "1";
  }

  private async setPendingSettoken(chatId: string) {
    await this.prisma.systemSetting.upsert({
      where: { key: pendingSettokenKey(chatId) },
      create: { key: pendingSettokenKey(chatId), value: "1" },
      update: { value: "1" },
    });
  }

  private async clearPendingSettoken(chatId: string) {
    await this.prisma.systemSetting.deleteMany({
      where: { key: pendingSettokenKey(chatId) },
    });
  }

  private looksLikeJwt(value: string) {
    return value.split(".").length === 3 && value.startsWith("eyJ");
  }

  private extractAuthPayload(raw: string): {
    token: string;
    cookie: string;
    curlHeaders?: Record<string, string>;
    curlInvalid?: boolean;
  } {
    const text = raw.trim();
    const curlParsed = this.parseCurlCommand(text);
    if (curlParsed && Object.keys(curlParsed.headers).length > 0) {
      const auth = curlParsed.headers.authorization || "";
      const bearerMatch = auth.match(/Bearer\s+(.+)/i);
      const token = bearerMatch?.[1]?.trim() || "";
      const cookie = curlParsed.headers.cookie || curlParsed.cookieBag || "";
      if (!token || !this.looksLikeJwt(token)) {
        return { token: "", cookie: "", curlInvalid: true };
      }
      return { token, cookie, curlHeaders: curlParsed.headers };
    }

    const bearerMatch = text.match(/Bearer\s+([A-Za-z0-9\-_.]+\.[A-Za-z0-9\-_.]+\.[A-Za-z0-9\-_.]+)/i);
    const authBlockMatch = text.match(/authorization\s*\n\s*Bearer\s+([^\s\n]+)/i);
    const inlineJwt = this.looksLikeJwt(text) ? text : "";
    const token = (authBlockMatch?.[1] || bearerMatch?.[1] || inlineJwt || "").trim();

    const cookieHeaderMatch = text.match(/(?:^|\n)\s*cookie\s*\n([^\n]+)/i);
    const cookieInlineMatch = text.match(/(?:^|\n)\s*cookie\s*:\s*([^\n]+)/i);
    const cookie = (cookieHeaderMatch?.[1] || cookieInlineMatch?.[1] || "").trim();

    return { token, cookie };
  }

  /**
   * Parse "Copy as cURL" (Chrome/Brave): curl 'url' -H 'k: v' -b 'cookie=...'
   */
  private parseCurlCommand(text: string): {
    url?: string;
    headers: Record<string, string>;
    cookieBag?: string;
  } | null {
    const trimmed = text.trim();
    if (!/^curl\s/i.test(trimmed)) return null;

    const oneLine = trimmed.replace(/\\\r?\n\s*/g, " ").replace(/"+\s*$/g, "").trim();

    const urlMatch = oneLine.match(/curl\s+['"]([^'"]+)['"]/i);
    const url = urlMatch?.[1];

    const headers: Record<string, string> = {};
    const hRe = /(?:-H|--header)\s+'([^']*)'/gi;
    let m: RegExpExecArray | null;
    while ((m = hRe.exec(oneLine)) !== null) {
      const line = m[1];
      const colon = line.indexOf(":");
      if (colon <= 0) continue;
      const name = line.slice(0, colon).trim().toLowerCase();
      if (name === "host") continue;
      const value = line.slice(colon + 1).trim();
      headers[name] = value;
    }

    const hRe2 = /(?:-H|--header)\s+"([^"]*)"/gi;
    while ((m = hRe2.exec(oneLine)) !== null) {
      const line = m[1];
      const colon = line.indexOf(":");
      if (colon <= 0) continue;
      const name = line.slice(0, colon).trim().toLowerCase();
      if (name === "host") continue;
      const value = line.slice(colon + 1).trim();
      headers[name] = value;
    }

    const bMatch = oneLine.match(
      /(?:^|\s)(?:-b|--cookie)\s+'([^']*)'|(?:^|\s)(?:-b|--cookie)\s+"([^"]*)"/i,
    );
    const cookieBag = bMatch?.[1] || bMatch?.[2];
    if (cookieBag && !headers.cookie) {
      headers.cookie = cookieBag;
    }

    return { url, headers, cookieBag };
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const payloadPart = token.split(".")[1];
      if (!payloadPart) return null;
      const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const decoded = Buffer.from(padded, "base64").toString("utf8");
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async sendTelegramMessage(text: string, targetChatId?: string) {
    const telegramToken = this.envService.values.TELEGRAM_BOT_TOKEN;
    const telegramChatId = targetChatId || (await this.getNotificationChatId());
    if (!telegramToken || !telegramChatId) {
      this.logger.warn("Telegram send skipped: missing bot token or chat id");
      return;
    }

    await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      chat_id: telegramChatId,
      text,
    });
  }

  private async getNotificationChatId(): Promise<string | null> {
    const envChatId = this.envService.values.TELEGRAM_CHAT_ID;
    if (envChatId) return envChatId;
    const lastChat = await this.prisma.systemSetting.findUnique({
      where: { key: TELEGRAM_LAST_CHAT_ID_KEY },
    });
    return lastChat?.value ?? null;
  }

  private async hasFlag(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    return Boolean(setting?.value);
  }

  private async setFlag(key: string) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: "1" },
      update: { value: "1" },
    });
  }

  private async clearAlertFlags() {
    await this.prisma.systemSetting.deleteMany({
      where: { key: { startsWith: "token_alert_" } },
    });
  }
}
