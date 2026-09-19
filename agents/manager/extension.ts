import { spawn } from "node:child_process";

type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type ListResponse = {
  tools?: ToolSchema[];
  error?: string;
};

type ToolContentItem = {
  type: "text";
  text: string;
};

type ToolResult = {
  content: ToolContentItem[];
  details?: unknown;
};

interface ExtensionAPI {
  registerTool(tool: {
    name: string;
    label: string;
    loadMode: "essential";
    description: string;
    parameters: Record<string, unknown>;
    execute(
      toolCallId: string,
      args: Record<string, unknown>,
      signal?: AbortSignal
    ): Promise<ToolResult>;
  }): void;
}

export default async function receptionistTools(pi: ExtensionAPI): Promise<void> {
  const root = process.env.RECEPTIONIST_ROOT || process.cwd();
  const pythonBin = process.env.RECEPTIONIST_PYTHON || "python";

  const runCli = (
    args: string[],
    stdinPayload?: unknown,
    signal?: AbortSignal
  ): Promise<unknown> => {
    const { promise, resolve } = Promise.withResolvers<unknown>();

    if (signal?.aborted) {
      resolve({ error: "tool execution aborted prior to spawn" });
      return promise;
    }

    const child = spawn(pythonBin, ["-m", "agents.manager.tool_cli", ...args], {
      cwd: root,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const onAbort = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // process may already be terminated
      }
      resolve({ error: "tool execution cancelled by abort signal" });
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (err: Error) => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve({ error: `failed to spawn tool process: ${err.message}` });
    });

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      if (code !== 0 && !stdout.trim()) {
        resolve({ error: `tool_cli exited with code ${code}: ${stderr.slice(-2000)}` });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        resolve({ error: `failed to parse tool output: ${message}`, raw: stdout });
      }
    });

    if (stdinPayload !== undefined) {
      child.stdin.write(JSON.stringify(stdinPayload));
    }
    child.stdin.end();

    return promise;
  };

  const listRes = (await runCli(["list"])) as ListResponse;
  if (!listRes.tools || listRes.error) {
    throw new Error(listRes.error || "Receptionist tool schema discovery failed");
  }

  for (const spec of listRes.tools) {
    pi.registerTool({
      name: spec.name,
      label: spec.name,
      loadMode: "essential",
      description: spec.description,
      parameters: spec.parameters,
      async execute(
        _toolCallId: string,
        args: Record<string, unknown>,
        signal?: AbortSignal
      ): Promise<ToolResult> {
        const rawResult = await runCli([], { name: spec.name, args }, signal);
        const textPayload = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult);
        return {
          content: [{ type: "text", text: textPayload }],
          details: rawResult,
        };
      },
    });
  }
}
