// One way for the onboarding screens to talk to the API: JSON in and out, never cached, and
// an answer that says whether it worked and with what status, so a screen can word a 422 or a
// 429 itself instead of guessing from a thrown error.

export async function call<T>(
  url: string, method = "GET", body?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, {
    method, cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as T };
}
