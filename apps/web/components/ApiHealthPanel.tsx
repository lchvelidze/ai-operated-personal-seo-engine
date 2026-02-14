"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function ApiHealthPanel() {
  const [state, setState] = useState("checking...");

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch(`${apiBase}/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setState(`ok (${data.timestamp ?? "no timestamp"})`);
      } catch (error) {
        setState(`unreachable (${error instanceof Error ? error.message : "unknown error"})`);
      }
    };

    void run();
  }, []);

  return (
    <section className="panel">
      <h2>API Health</h2>
      <p>
        Endpoint: <code>{apiBase}/health</code>
      </p>
      <p>Status: {state}</p>
    </section>
  );
}
