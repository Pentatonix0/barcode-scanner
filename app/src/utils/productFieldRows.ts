export type ProductFieldRow = {
  key: string;
  value: string;
};

export function buildProductFieldRows(
  fields: Record<string, unknown> | null | undefined,
  barcode?: string | null
): ProductFieldRow[] {
  const rows: ProductFieldRow[] = [];

  const normalizedBarcode = String(barcode ?? "").trim();
  if (normalizedBarcode) {
    rows.push({ key: "BARCODE", value: normalizedBarcode });
  }

  if (!fields) {
    return rows;
  }

  for (const [key, rawValue] of Object.entries(fields)) {
    if (key.trim().toLowerCase() === "barcode") {
      continue;
    }
    rows.push({
      key,
      value: rawValue === null || rawValue === undefined ? "—" : String(rawValue),
    });
  }

  return rows;
}
