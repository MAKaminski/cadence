// The iOS app's sign-in, played by the test: it registers itself as a native client with a custom-scheme
// redirect, sends the user through sign-in and consent, gets a token for the REST API (not the MCP
// server), refreshes it, and uses it. Runs against `pnpm demo`.
import { expect, test } from "./test";
import { createHash, randomBytes } from "node:crypto";

const BASE = "http://localhost:3000";
const REDIRECT = "app.cadence.ios:/oauth/callback";
const API = `${BASE}/api/v1`;

test("the iOS app signs in with OAuth and calls the API; audiences don't cross", async ({ page, request }) => {
  const as = await (await request.get(`${BASE}/.well-known/oauth-authorization-server/api/auth`)).json();
  let regRes = await request.post(as.registration_endpoint, { data: { client_name: "Cadence for iOS", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", application_type: "native", grant_types: ["authorization_code", "refresh_token"] } });
  if (regRes.status() === 429) { await new Promise((r) => setTimeout(r, (Number(regRes.headers()["x-retry-after"] ?? 60) + 1) * 1000)); regRes = await request.post(as.registration_endpoint, { data: { client_name: "Cadence for iOS", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", application_type: "native", grant_types: ["authorization_code", "refresh_token"] } }); }
  const client = await regRes.json();
  expect(client.client_id).toBeTruthy();

  // A subscriber (demo trial) so the API answers 200 rather than 402.
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.waitForURL("**/onboarding");

  const authorize = async (resource: string) => {
    const verifier = randomBytes(32).toString("base64url");
    const u = new URL(as.authorization_endpoint);
    Object.entries({
      response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, state: "ios",
      scope: "openid offline_access cadence:read cadence:write cadence:approve", resource,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    // The browser can't follow app.cadence.ios:, so read the redirect from the consent response or the
    // authorize redirect (after the first consent, authorize redirects straight back).
    const consent = page.waitForResponse((r) => r.url().includes("/oauth2/consent"), { timeout: 10_000 }).catch(() => null);
    const direct = page.waitForResponse((r) => r.url().includes("/oauth2/authorize") && (r.headers()["location"] ?? "").startsWith(REDIRECT), { timeout: 10_000 }).catch(() => null);
    await page.goto(u.toString()).catch(() => undefined); // the final hop to the custom scheme aborts navigation
    const allow = page.getByRole("button", { name: "Allow" });
    if (await allow.isVisible().catch(() => false)) await allow.click();
    const r = (await Promise.race([consent, direct])) ?? (await consent) ?? (await direct);
    const target = r!.url().includes("/consent") ? (await r!.json()).redirect_uri ?? (await r!.json()).url : r!.headers()["location"];
    expect(target.startsWith(REDIRECT)).toBe(true);
    const code = new URL(target).searchParams.get("code")!;
    return (await (await request.post(as.token_endpoint, { form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier, resource } })).json());
  };

  const tok = await authorize(API);
  expect(tok.access_token).toBeTruthy();
  expect(tok.refresh_token).toBeTruthy();

  const me = await request.get(`${API}/me`, { headers: { authorization: `Bearer ${tok.access_token}` } });
  expect(me.status()).toBe(200);
  expect(me.headers()["ratelimit-limit"]).toBe("60");
  expect((await me.json()).scopes).toEqual(["read", "write"]); // approve is unticked on the consent screen by default

  // A token for the API is not a token for the MCP server, and vice versa.
  const mcp = await request.post(`${BASE}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: { authorization: `Bearer ${tok.access_token}`, accept: "application/json, text/event-stream" } });
  expect(mcp.status()).toBe(401);
  const mcpTok = await authorize(`${BASE}/api/mcp`);
  expect((await request.get(`${API}/me`, { headers: { authorization: `Bearer ${mcpTok.access_token}` } })).status()).toBe(401);

  // Refresh keeps the app signed in without the browser.
  const refreshed = await (await request.post(as.token_endpoint, { form: { grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: client.client_id, resource: API } })).json();
  expect(refreshed.access_token).toBeTruthy();
  expect((await request.get(`${API}/me`, { headers: { authorization: `Bearer ${refreshed.access_token}` } })).status()).toBe(200);

  // Device registration for push, as the app does at launch.
  const dev = await request.post(`${API}/devices`, { headers: { authorization: `Bearer ${refreshed.access_token}` }, data: { token: "c".repeat(64), environment: "sandbox" } });
  expect(dev.status()).toBe(201);
});
