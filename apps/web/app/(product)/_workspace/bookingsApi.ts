// One way the Bookings setup screens call the API (ALY-259): JSON in, the answer and, when it
// refuses, the refusal's stable `code` out. A network failure is the code "generic".

export async function send(
  url: string, method: string, body?: unknown,
): Promise<{ code: string; data: Record<string, unknown> }> {
  try {
    const response = await fetch(url, {
      method, cache: "no-store", headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { code: "", data };
    const detail = data?.detail;
    return { code: (typeof detail === "object" && detail?.code) || "generic", data };
  } catch {
    return { code: "generic", data: {} };
  }
}
