const API_BASE = (process.env.API_BASE ?? "http://localhost:4000").replace(/\/+$/, "");
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD ?? process.env.DEMO_PASSWORD ?? "change-me-12345";
const LOGIN_EMAILS = (process.env.VERIFY_LOGIN_EMAILS ?? "owner@local.dev,levan@local.dev")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

async function requestJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    signal: AbortSignal.timeout(10_000)
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body };
}

async function main() {
  if (!LOGIN_EMAILS.length) {
    throw new Error("VERIFY_LOGIN_EMAILS must include at least one email");
  }

  console.log(`[verify:login] API_BASE=${API_BASE}`);

  let failed = false;

  const health = await requestJson(`${API_BASE}/health`, { method: "GET" });
  if (!health.response.ok || health.body?.status !== "ok") {
    failed = true;
    console.error(`[verify:login] FAIL health status=${health.response.status}`);
  } else {
    console.log("[verify:login] PASS health");
  }

  for (const email of LOGIN_EMAILS) {
    const login = await requestJson(`${API_BASE}/auth/login`, {
      method: "POST",
      body: JSON.stringify({
        email,
        password: LOGIN_PASSWORD
      })
    });

    const ok =
      login.response.status === 200 &&
      typeof login.body?.data?.token === "string" &&
      login.body?.data?.user?.email === email;

    if (ok) {
      console.log(`[verify:login] PASS login ${email}`);
      continue;
    }

    failed = true;
    const message = login.body?.error?.message ?? "Unexpected response";
    console.error(`[verify:login] FAIL login ${email} status=${login.response.status} message=${message}`);
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log("[verify:login] PASS all checks");
}

main().catch((error) => {
  console.error(`[verify:login] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
