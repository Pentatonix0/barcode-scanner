function asMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => asMessage(item))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join("; ") : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("detail" in record) {
      const detail = asMessage(record.detail);
      if (detail) return detail;
    }
    if ("message" in record) {
      const message = asMessage(record.message);
      if (message) return message;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function extractErrorMessage(raw: string, status: number): string {
  const text = raw.trim();
  if (!text) return `HTTP ${status}`;

  try {
    const parsed = JSON.parse(text) as unknown;
    return asMessage(parsed) ?? `HTTP ${status}`;
  } catch {
    return text;
  }
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(extractErrorMessage(raw, response.status));
  }

  if (!raw.trim()) {
    return null as T;
  }

  return JSON.parse(raw) as T;
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const utf = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1]);
    } catch {
      return utf[1];
    }
  }

  const ascii = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return ascii?.[1] ?? null;
}

export async function fetchBlob(
  url: string,
  options?: RequestInit
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(extractErrorMessage(raw, response.status));
  }

  const blob = await response.blob();
  const filename = extractFilename(response.headers.get("content-disposition"));
  return { blob, filename };
}
