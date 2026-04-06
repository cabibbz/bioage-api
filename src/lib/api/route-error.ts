import { NextResponse } from "next/server";

function classifyStatus(message: string) {
  if (message.includes("was not found")) {
    return 404;
  }

  if (
    message.includes("is not in the catalog") ||
    message.includes("cannot be promoted") ||
    message.includes("cannot be changed") ||
    message.includes("does not include a proposed canonical mapping") ||
    message.includes("does not include a promotable value")
  ) {
    return 400;
  }

  return 500;
}

export function toRouteErrorResponse(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: classifyStatus(message) });
}
