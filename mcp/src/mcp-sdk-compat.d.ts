import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  interface McpServer {
    registerTool(
      name: string,
      config: {
        title?: string;
        description?: string;
        inputSchema: z.ZodRawShape;
        annotations?: ToolAnnotations;
      },
      callback: (args: Record<string, unknown>) => Promise<{
        content: Array<{ type: "text"; text: string }>;
        structuredContent?: Record<string, unknown>;
      }>,
    ): unknown;
  }
}
