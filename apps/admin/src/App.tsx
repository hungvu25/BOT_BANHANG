import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Mapping = {
  id: string;
  aProductId: string;
  aVariantId: string;
  bProductId: number;
  outputTemplate: string;
  enabled: boolean;
};

type AOrder = {
  id?: string;
  productId?: string;
  variantId?: string;
  productTitle?: string;
  variantName?: string;
  buyerUsername?: string;
  quantity?: number;
  status?: string;
  createdAt?: string;
  product?: { id?: string };
  variant?: { id?: string };
  [key: string]: unknown;
};

type BProduct = {
  id?: number | string;
  product_id?: number | string;
  name?: string;
  title?: string;
  price?: number | string;
  price_vnd?: number | string;
  stock?: number | string;
  [key: string]: unknown;
};

const API_BASE = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000/api";
const ORDER_STATUS_OPTIONS = [
  "ALL",
  "PENDING_GROUP",
  "COMPLETED",
  "DISPUTED",
  "ESCALATED",
  "REFUNDED",
  "CANCELLED",
  "PREPARE",
  "PROCESSING",
  "WAITING",
  "PRE_ORDER",
  "WAITING_PAYMENT",
  "WAITING_CONFIRM",
] as const;

function extractList<T>(response: any, keys: string[]): T[] {
  if (Array.isArray(response)) return response as T[];
  for (const key of keys) {
    if (Array.isArray(response?.[key])) return response[key] as T[];
  }
  return [];
}

function toVietnameseOrderStatus(status?: string): string {
  const normalized = String(status ?? "").toUpperCase();
  const statusMap: Record<string, string> = {
    ALL: "Tất cả",
    PENDING_GROUP: "Đã giao, chờ mở khóa tiền (72h)",
    PENDING: "Đã giao, chờ mở khóa tiền (72h)",
    COMPLETED: "Hoàn thành",
    DISPUTED: "Đang tranh chấp",
    ESCALATED: "Đã khiếu nại",
    CANCELLED: "Đã hủy",
    FAILED: "Thất bại",
    PREPARE: "Đang chuẩn bị",
    PROCESSING: "Web A đang chuyển hàng từ kho",
    WAITING: "Đang chờ",
    PRE_ORDER: "Đơn đặt trước",
    WAITING_PAYMENT: "Chờ thanh toán",
    WAITING_CONFIRM: "Chờ xác nhận",
    INSURANCE_PENDING: "Đã giao, chờ mở khóa tiền (72h)",
    REFUNDED: "Đã hoàn tiền",
  };

  return statusMap[normalized] ?? (status || "-");
}

function formatCurrencyVnd(value: unknown): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "-";
  return `${amount.toLocaleString("vi-VN")} VND`;
}

function formatRemainingHours(value: unknown): string {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return "Không rõ";
  if (hours <= 0) return "Đã hết hạn";
  return `${hours.toFixed(2)} giờ`;
}

function App() {
  const [status, setStatus] = useState<any>(null);
  const [aOrders, setAOrders] = useState<AOrder[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [bProducts, setBProducts] = useState<BProduct[]>([]);
  const [aOrderStatusFilter, setAOrderStatusFilter] = useState<string>("PRE_ORDER");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    aProductId: "",
    aVariantId: "",
    bProductId: "",
    outputTemplate: "{{account}}",
    enabled: true,
  });
  const [uploadTestForm, setUploadTestForm] = useState({
    productId: "",
    variantId: "",
    content: "",
  });
  const [uploadTestResult, setUploadTestResult] = useState<any>(null);

  const api = useMemo(() => {
    return {
      fetchStatus: () => fetch(`${API_BASE}/orders/status`).then((r) => r.json()),
      fetchMappings: () => fetch(`${API_BASE}/orders/mappings`).then((r) => r.json()),
      fetchBProducts: () => fetch(`${API_BASE}/orders/b-products`).then((r) => r.json()),
      fetchAOrders: () => fetch(`${API_BASE}/orders/a-orders`).then((r) => r.json()),
      upsertMapping: (payload: any) =>
        fetch(`${API_BASE}/orders/mappings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json()),
      testUpload: (payload: any) =>
        fetch(`${API_BASE}/orders/test-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json()),
    };
  }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      const [s, m] = await Promise.all([api.fetchStatus(), api.fetchMappings()]);
      setStatus(s);
      setMappings(m);
    } finally {
      setBusy(false);
    }
  };

  const loadBProducts = async () => {
    const response = await api.fetchBProducts();
    const list = extractList<BProduct>(response, ["data", "products", "items", "result"]);
    setBProducts(list);
    setNotice(list.length ? `Đã tải ${list.length} sản phẩm B` : "Không có sản phẩm B để hiển thị");
  };

  const loadAOrders = async () => {
    const response = await api.fetchAOrders();
    const list = extractList<AOrder>(response, ["data", "orders", "items", "result"]);
    setAOrders(list);
    setNotice(list.length ? `Đã tải ${list.length} đơn hàng A` : "Không có đơn hàng A để hiển thị");
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, []);

  const submitMapping = async (event: FormEvent) => {
    event.preventDefault();
    await api.upsertMapping({
      ...form,
      bProductId: Number(form.bProductId),
    });
    await refresh();
  };

  const submitUploadTest = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api.testUpload(uploadTestForm);
    setUploadTestResult(result);
    setNotice(result?.ok ? "Upload thử thành công" : "Upload thử thất bại");
  };

  const displayedAOrders = (
    aOrderStatusFilter === "ALL"
      ? aOrders
      : aOrderStatusFilter === "PENDING_GROUP"
        ? aOrders.filter((order) =>
            ["PENDING", "INSURANCE_PENDING"].includes(
              String(order.status ?? "").toUpperCase(),
            ),
          )
      : aOrders.filter(
          (order) => String(order.status ?? "").toUpperCase() === aOrderStatusFilter,
        )
  ).sort((a, b) => {
    const aStatus = String(a.status ?? "").toUpperCase();
    const bStatus = String(b.status ?? "").toUpperCase();
    if (aStatus === "PRE_ORDER" && bStatus !== "PRE_ORDER") return -1;
    if (aStatus !== "PRE_ORDER" && bStatus === "PRE_ORDER") return 1;
    const aTime = new Date(String(a.createdAt ?? 0)).getTime();
    const bTime = new Date(String(b.createdAt ?? 0)).getTime();
    return bTime - aTime;
  });

  return (
    <main className="page">
      <header>
        <h1>Bot Quản Lý Nhập Hàng A - B - A</h1>
        <button onClick={() => void refresh()} disabled={busy}>
          {busy ? "Đang tải..." : "Làm mới"}
        </button>
      </header>
      {notice ? <p className="notice">{notice}</p> : null}

      <section className="panel stats">
        <h2>Trạng thái bot</h2>
        <div className="grid">
          <div>Đang chạy: {String(status?.running ?? false)}</div>
          <div>Chu kỳ quét: {status?.pollIntervalMs ?? "-"} ms</div>
          <div className="balanceCard">
            <div className="balanceTitle">Token Seller A</div>
            <div className="balanceRow">
              <span>Nguồn token:</span>
              <strong>{String(status?.sellerTokenStatus?.source ?? "-")}</strong>
            </div>
            <div className="balanceRow">
              <span>Hết hạn lúc:</span>
              <strong>{String(status?.sellerTokenStatus?.expiresAt ?? "Không rõ")}</strong>
            </div>
            <div className="balanceRow">
              <span>Thời gian còn lại:</span>
              <strong>{formatRemainingHours(status?.sellerTokenStatus?.remainingHours)}</strong>
            </div>
          </div>
          <div className="balanceCard">
            <div className="balanceTitle">Ví B</div>
            <div className="balanceRow">
              <span>Tài khoản:</span>
              <strong>{String(status?.bBalance?.username ?? "-")}</strong>
            </div>
            <div className="balanceRow">
              <span>Số dư VND:</span>
              <strong>{formatCurrencyVnd(status?.bBalance?.balance_vnd)}</strong>
            </div>
            <div className="balanceRow">
              <span>Số dư USDT:</span>
              <strong>{String(status?.bBalance?.balance_usdt ?? "-")}</strong>
            </div>
            <div className="balanceRow">
              <span>Trạng thái API:</span>
              <strong>{status?.bBalance?.success ? "Kết nối tốt" : "Chưa lấy được dữ liệu"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Liên kết sản phẩm A -&gt; B</h2>
        <form className="mappingForm" onSubmit={submitMapping}>
          <input
            placeholder="Mã sản phẩm A"
            value={form.aProductId}
            onChange={(e) => setForm((s) => ({ ...s, aProductId: e.target.value }))}
            required
          />
          <input
            placeholder="Mã biến thể A"
            value={form.aVariantId}
            onChange={(e) => setForm((s) => ({ ...s, aVariantId: e.target.value }))}
            required
          />
          <select
            value={form.bProductId}
            onChange={(e) => setForm((s) => ({ ...s, bProductId: e.target.value }))}
            required
          >
            <option value="">Chọn mã sản phẩm B</option>
            {bProducts.map((item, index) => {
              const id = String(item.product_id ?? item.id ?? "");
              const label = String(item.name ?? item.title ?? `Product ${id || index + 1}`);
              return (
                <option key={`${id}-${index}`} value={id}>
                  {id} - {label}
                </option>
              );
            })}
          </select>
          <input
            placeholder="Mẫu dữ liệu đầu ra"
            value={form.outputTemplate}
            onChange={(e) => setForm((s) => ({ ...s, outputTemplate: e.target.value }))}
          />
          <label>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
            />
            Bật
          </label>
          <button type="submit">Lưu liên kết</button>
          <button type="button" onClick={() => void loadBProducts()}>
            Tải sản phẩm B
          </button>
        </form>

        <table>
          <thead>
            <tr>
              <th>Sản phẩm A</th>
              <th>Biến thể A</th>
              <th>Sản phẩm B</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id}>
                <td>{m.aProductId}</td>
                <td>{m.aVariantId}</td>
                <td>{m.bProductId}</td>
                <td>{String(m.enabled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Danh sách sản phẩm B</h2>
        <table>
          <thead>
            <tr>
              <th>Mã sản phẩm B</th>
              <th>Tên sản phẩm</th>
              <th>Giá</th>
              <th>Tồn kho</th>
            </tr>
          </thead>
          <tbody>
            {bProducts.map((item, index) => (
              <tr key={`${String(item.product_id ?? item.id ?? index)}`}>
                <td>{String(item.product_id ?? item.id ?? "-")}</td>
                <td>{String(item.name ?? item.title ?? "-")}</td>
                <td>{String(item.price ?? item.price_vnd ?? "-")}</td>
                <td>{String(item.stock ?? "-")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Upload thử lên kho A</h2>
        <form className="mappingForm" onSubmit={submitUploadTest}>
          <input
            placeholder="Mã sản phẩm trên A"
            value={uploadTestForm.productId}
            onChange={(e) =>
              setUploadTestForm((s) => ({
                ...s,
                productId: e.target.value,
              }))
            }
            required
          />
          <input
            placeholder="Mã biến thể trên A"
            value={uploadTestForm.variantId}
            onChange={(e) =>
              setUploadTestForm((s) => ({
                ...s,
                variantId: e.target.value,
              }))
            }
            required
          />
          <input
            placeholder="Nội dung tài khoản (ví dụ: email|mật khẩu)"
            value={uploadTestForm.content}
            onChange={(e) =>
              setUploadTestForm((s) => ({
                ...s,
                content: e.target.value,
              }))
            }
            required
          />
          <button type="submit">Upload thử</button>
        </form>
        {uploadTestResult ? (
          <pre className="jsonBox">{JSON.stringify(uploadTestResult, null, 2)}</pre>
        ) : null}
      </section>

      <section className="panel">
        <h2>Danh sách đơn hàng A</h2>
        <div className="tableActions">
          <button type="button" onClick={() => void loadAOrders()}>
            Tải đơn hàng A
          </button>
          <select
            value={aOrderStatusFilter}
            onChange={(event) => setAOrderStatusFilter(event.target.value)}
          >
            {ORDER_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {toVietnameseOrderStatus(status)}
              </option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mã đơn hàng</th>
              <th>Người mua</th>
              <th>Tên sản phẩm</th>
              <th>Tên biến thể</th>
              <th>Mã sản phẩm</th>
              <th>Mã biến thể</th>
              <th>Số lượng</th>
              <th>Trạng thái</th>
              <th>Thời gian tạo</th>
            </tr>
          </thead>
          <tbody>
            {displayedAOrders.map((order, index) => (
              <tr key={`${order.id ?? index}`}>
                <td>{String(order.id ?? "-")}</td>
                <td>{String(order.buyerUsername ?? "-")}</td>
                <td>{String(order.productTitle ?? "-")}</td>
                <td>{String(order.variantName ?? "-")}</td>
                <td>{String(order.productId ?? order.product?.id ?? "-")}</td>
                <td>{String(order.variantId ?? order.variant?.id ?? "-")}</td>
                <td>{String(order.quantity ?? "-")}</td>
                <td>{toVietnameseOrderStatus(String(order.status ?? "-"))}</td>
                <td>{order.createdAt ? new Date(String(order.createdAt)).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </main>
  );
}

export default App;
