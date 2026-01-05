import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const client = new OpenAI({ apiKey });

  const tools =
    process.env.HOME_ASSISTANT_MCP_ENDPOINT && process.env.HOME_ASSISTANT_TOKEN
      ? [
          {
            type: "mcp" as const,
            server_label: "HomeAssistant",
            server_url: process.env.HOME_ASSISTANT_MCP_ENDPOINT,
            authorization: process.env.HOME_ASSISTANT_TOKEN,
            require_approval: "never" as const,
          },
        ]
      : [];

  const response = await client.realtime.clientSecrets.create({
    session: {
      type: "realtime",
      model: "gpt-realtime",
      audio: {
        output: {
          voice: "cedar",
        },
      },
      instructions:
        "You are a friendly English tutor. Speak naturally, encouragingly, and stay in English.",
      tools,
    },
  });

  return NextResponse.json({ apiKey: response.value });
}
