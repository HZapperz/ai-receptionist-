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
