// Calls the agents service through the /agents rewrite in next.config.ts.
export async function postAgents<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch("/agents" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function getAgents<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch("/agents" + path, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed: ${res.status} ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}
