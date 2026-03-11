import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { bootstrapTpLinkSubscriptions } from "@/lib/domain/tasks";

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-internal-admin-token");
  if (env.internalAdminToken && token !== env.internalAdminToken) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await bootstrapTpLinkSubscriptions();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Bootstrap TP-LINK subscriptions failed."
      },
      { status: 500 }
    );
  }
}
