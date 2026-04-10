import { OrdersService } from "./orders.service";

describe("OrdersService.normalizeBoughtData", () => {
  const service = new OrdersService({} as any, {} as any, {} as any, {
    values: { MAX_RETRIES: "3", POLL_INTERVAL_MS: "5000", CONCURRENCY: "1" },
  } as any, {} as any);

  it("formats array accounts to lines", () => {
    const output = service.normalizeBoughtData(
      {
        data: {
          accounts: [
            { email: "a@test.com", password: "123" },
            { email: "b@test.com", password: "456" },
          ],
        },
      },
      "{{account}}",
    );
    expect(output).toBe("a@test.com|123\nb@test.com|456");
  });

  it("replaces template when content exists", () => {
    const output = service.normalizeBoughtData(
      {
        data: {
          content: "user@mail.com|pass123",
        },
      },
      "prefix: {{account}}",
    );
    expect(output).toBe("prefix: user@mail.com|pass123");
  });
});
