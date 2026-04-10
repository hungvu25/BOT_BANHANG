# Bot auto nhap hang A -> B -> A

Bot nay se:
- Poll don moi tu web A.
- Tim mapping san pham A/variant -> product B.
- Tu dong mua hang qua API B.
- Convert du lieu account ve dang `key|value`.
- Upload inventory nguoc lai web A.

## 1) Cau hinh

1. Copy `.env.example` thanh `.env`.
2. Dien key that:
   - `A_API_KEY`: Bearer token cua datammo.
   - `B_API_KEY`: X-API-Key cua nha cung cap B.
3. Chinh `A_BASE_URL`, `B_BASE_URL`, `POLL_INTERVAL_MS` neu can.

## 2) Chay local

```bash
npm install
npx prisma migrate dev --name init --schema apps/server/prisma/schema.prisma
npm run dev:server
npm run dev:admin
```

- Server: `http://localhost:3000/api`
- Admin UI: `http://localhost:5173`

## 3) API quan tri backend

- `GET /api/orders/status`: thong ke dashboard + so du B.
- `GET /api/orders/events`: danh sach don da xu ly.
- `GET /api/orders/mappings`: danh sach mapping.
- `GET /api/orders/b-products`: lay danh sach san pham B.
- `GET /api/orders/a-orders`: lay danh sach don A (seller sales).
- `POST /api/orders/mappings`: tao/cap nhat mapping.
- `POST /api/orders/test-upload`: upload thu inventory len A.
- `POST /api/orders/seller-token`: cap nhat seller token nong (khong can restart). Body: `{ "token": "..." }` hoac `{ "curl": "curl 'https://...' -H '...' -b '...'" }` (Copy as cURL day du).
- `POST /api/orders/events/:aOrderId/reprocess`: xu ly lai don loi.

Body tao/cap nhat mapping:

```json
{
  "aProductId": "255f4d24-353a-428e-a7c5-df17cf0f027c",
  "aVariantId": "1d2c44fd-7201-4a17-9edd-20a1fbfa0072",
  "bProductId": 123,
  "outputTemplate": "{{account}}",
  "enabled": true
}
```

## 4) Docker

```bash
docker compose up --build
```

- Backend: `http://localhost:3000/api`
- Admin: `http://localhost:5173`

## 5) Test

```bash
npm test
```

Test hien co bao gom formatter account output trong worker.

## 6) Bao ve token va canh bao Telegram

Them bien moi trong `.env`:

```bash
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
TOKEN_EXPIRY_ALERT_HOURS="24,6,1"
A_SELLER_COOKIE=""
A_HTTP_USER_AGENT=""
```

- Bot se canh bao Telegram truoc khi token seller het han theo cac moc gio.
- Gui `/status` cho Telegram bot de xem han token.
- Gui `/settoken` — bot tra loi "Hay dan..." — roi gui tin tiep theo:
  - JWT thuần, hoac block header, hoac **nguyen lenh curl** (Chrome: Network → request → Copy as cURL) — bot luu toan bo `-H` + `-b` de goi API giong trinh duyet.
- Van ho tro mot dong `/settoken <JWT>`. Gui `/cancel` de huy buoc cho token.
- Neu API A tra 403 + HTML Cloudflare: `cf_clearance` gan voi IP trinh duyet — may chay backend phai cung IP cong khai voi luc ban lay cookie (hoac can proxy/VPN khac). Lay lai cookie khi het han.
