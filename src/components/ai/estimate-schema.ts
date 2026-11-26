import { z } from "zod";

/** 기능 하나의 참고 단가. 계약 금액이 아니다. */
export const estimateItemSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  unit_price: z.number().int().min(10_000).max(500_000_000),
  basis: z.string().min(1).max(300),
});

export const estimateSchema = z
  .object({
    items: z.array(estimateItemSchema).min(1).max(12),
    total_amount: z.number().int().min(10_000).max(999_999_999_999),
  })
  .superRefine((value, ctx) => {
    const sum = value.items.reduce((total, item) => total + item.unit_price, 0);
    if (sum !== value.total_amount) {
      ctx.addIssue({
        code: "custom",
        message: "총액이 기능 단가의 합과 다릅니다.",
        path: ["total_amount"],
        input: value.total_amount,
      });
    }
  });

export type UnitEstimate = z.infer<typeof estimateSchema>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function price(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return value;
}

/** 모델이 보낸 값을 검사한다. 통과하지 않으면 저장하면 안 된다. */
export function parseEstimate(input: unknown) {
  if (!input || typeof input !== "object") return { ok: false as const };
  const record = input as { items?: unknown; total_amount?: unknown };
  const normalized = {
    total_amount: price(record.total_amount),
    items: Array.isArray(record.items)
      ? record.items.map((item) => {
          if (!item || typeof item !== "object") return item;
          const row = item as Record<string, unknown>;
          return {
            name: text(row.name),
            description: text(row.description),
            unit_price: price(row.unit_price),
            basis: text(row.basis),
          };
        })
      : record.items,
  };
  const parsed = estimateSchema.safeParse(normalized);
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, value: parsed.data };
}
