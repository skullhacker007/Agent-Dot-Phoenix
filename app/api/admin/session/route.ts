import { z } from "zod";
import {
  clearAdminCookie,
  createAdminSession,
  hasValidAdminToken,
  isAdminSessionValid,
  isSameOriginRequest,
  serializeAdminCookie,
} from "@/lib/agent-admin-auth";

const loginSchema = z.object({
  token: z.string().min(32).max(512),
});

export async function GET(request: Request) {
  try {
    return Response.json({ authenticated: isAdminSessionValid(request) });
  } catch (error) {
    console.error("Agent admin session is not configured.", error);
    return Response.json(
      { authenticated: false, error: "Agent management is not configured." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid admin token." }, { status: 400 });
  }

  try {
    if (!hasValidAdminToken(parsed.data.token)) {
      return Response.json({ error: "Invalid admin token." }, { status: 401 });
    }

    const session = createAdminSession();
    return Response.json(
      { authenticated: true },
      {
        headers: {
          "Set-Cookie": serializeAdminCookie(session.value, session.maxAge),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Unable to create agent admin session.", error);
    return Response.json(
      { error: "Agent management is not configured." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    if (!isAdminSessionValid(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
  } catch (error) {
    console.error("Agent management session validation failed.", error);
    return Response.json(
      { error: "Agent management is not configured." },
      { status: 503 },
    );
  }

  return Response.json(
    { authenticated: false },
    {
      headers: {
        "Set-Cookie": clearAdminCookie(),
        "Cache-Control": "no-store",
      },
    },
  );
}
