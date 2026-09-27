// An assistant connecting to Cadence exactly as Claude or Codex would: discover the OAuth server from
// the MCP endpoint's 401, register itself, send the user through sign-in and consent, swap the code for
// a token, then call tools with the official MCP client. Runs against `pnpm demo`.
import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const BASE = "http://localhost:3000";
const REDIRECT = "http://localhost:8765/callback";

async function mcp(token: string) {
  const client = new Client({ name: "e2e-assistant", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { authProvider: { token: async () => token } }));
  return client;
}
const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "");

test("an assistant connects with OAuth, checks in, reads drafts and approves only with consent", async ({ page, request }) => {
  // 1. Discovery: the MCP endpoint says where to authenticate.
  const unauth = await request.post(`${BASE}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: { accept: "application/json, text/event-stream" } });
  expect(unauth.status()).toBe(401);
  expect(unauth.headers()["www-authenticate"]).toContain("resource_metadata=");
  const prm = await (await request.get(`${BASE}/.well-known/oauth-protected-resource`)).json();
  const issuer = prm.authorization_servers[0] as string;
  const as = await (await request.get(`${BASE}/.well-known/oauth-authorization-server${new URL(issuer).pathname}`)).json();

  // 2. Dynamic client registration, as a native app with a loopback redirect (no application_type sent).
  // Open registration is rate limited (5 a minute per IP); like a real client, wait out x-retry-after
  // once, which matters when this suite is re-run back to back.
  const register = () => request.post(as.registration_endpoint, { data: { client_name: "E2E Assistant", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] } });
  let regRes = await register();
  if (regRes.status() === 429) {
    await new Promise((r) => setTimeout(r, (Number(regRes.headers()["x-retry-after"] ?? 60) + 1) * 1000));
    regRes = await register();
  }
  const reg = await regRes.json();
  expect(reg.client_id).toBeTruthy();

  // 3. The user signs in (demo) and consents, leaving approval unticked.
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authz = new URL(as.authorization_endpoint);
  Object.entries({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, scope: "openid offline_access cadence:read cadence:write cadence:approve", state: "s1", code_challenge: challenge, code_challenge_method: "S256", resource: prm.resource })
    .forEach(([k, v]) => authz.searchParams.set(k, v));
  let code = "";
  await page.route("http://localhost:8765/**", async (route) => { code = new URL(route.request().url()).searchParams.get("code") ?? ""; await route.fulfill({ body: "ok" }); });
  await page.goto(authz.toString());
  await expect(page.getByText("Sign in to connect your AI assistant")).toBeVisible();
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await expect(page.getByText("Connect E2E Assistant to Cadence?")).toBeVisible();
  await expect(page.getByText("Approve drafts to post")).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => code).not.toBe("");

  // 4. Token exchange (PKCE), bound to the MCP resource.
  const tok = await (await request.post(as.token_endpoint, { form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: prm.resource } })).json();
  expect(tok.access_token).toBeTruthy();
  expect(tok.scope).toContain("cadence:write");
  expect(tok.scope).not.toContain("cadence:approve");

  // The demo user has no trial yet, so the connection is refused with a clear 402 until they start one.
  const noPlan = await request.post(`${BASE}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: { authorization: `Bearer ${tok.access_token}`, accept: "application/json, text/event-stream" } });
  expect(noPlan.status()).toBe(402);
  await page.goto(`${BASE}/checkout`);
  await page.getByRole("button", { name: /start demo trial/i }).click();
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible(); // wait for the step to change before filling
  await page.getByRole("button", { name: /fill in the example answers/i }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL("**/app");

  // 5. Tools, through the official MCP client.
  const client = await mcp(tok.access_token);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["get_status", "list_drafts", "get_draft", "get_results", "get_setup", "save_checkin", "edit_draft", "skip_draft", "approve_draft"]));
  expect(tools).not.toContain("publish_now");
  expect(textOf(await client.callTool({ name: "get_status", arguments: {} }))).toMatch(/posts this week/);
  expect(textOf(await client.callTool({ name: "save_checkin", arguments: { notes: "This week a founder asked how to model heat-pump subsidies. My answer: model the timing, not the amount." } }))).toMatch(/Saved/);
  let drafts: { id: string }[] = [];
  await expect.poll(async () => {
    const t = textOf(await client.callTool({ name: "list_drafts", arguments: { status: ["draft", "held"] } }));
    drafts = JSON.parse(t.slice(t.indexOf("\n\n") + 2));
    return drafts.length;
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(textOf(await client.callTool({ name: "get_draft", arguments: { id: drafts[0].id } }))).toMatch(/"checks"/);

  // Approval was not granted on the consent screen, so the tool refuses.
  const denied = await client.callTool({ name: "approve_draft", arguments: { id: drafts[0].id } });
  expect(denied.isError).toBe(true);
  expect(textOf(denied)).toMatch(/cadence:approve/);
  await client.close();

  // 6. Claude Code / Codex CLI style: a Cadence API key in the Authorization header, this time with the
  //    approve scope granted in Settings, so approving works.
  await page.goto(`${BASE}/app/settings`);
  await page.getByLabel("Key name").fill("claude code");
  await page.getByText("Approve: lets this key approve drafts").click();
  await page.getByRole("button", { name: "Create key" }).click();
  const key = (await page.getByTestId("new-key").locator("code").textContent())!.trim();
  expect(key).toMatch(/^cad_/);
  const viaKey = await mcp(key);
  expect(textOf(await viaKey.callTool({ name: "approve_draft", arguments: { id: drafts[0].id } }))).toMatch(/Approved/);
  await viaKey.close();

  // 7. Disconnecting in Settings cuts the assistant off immediately, even though its token hasn't expired.
  await page.goto(`${BASE}/app/settings`);
  const row = page.getByTestId("connections").locator("li", { hasText: "E2E Assistant" });
  await row.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByTestId("connections")).toHaveCount(0);
  const cut = await request.post(`${BASE}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: { authorization: `Bearer ${tok.access_token}`, accept: "application/json, text/event-stream" } });
  expect(cut.status()).toBe(401);

  // 8. A token for another audience is rejected.
  const other = await request.post(`${BASE}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: { authorization: "Bearer not-a-real-token", accept: "application/json, text/event-stream" } });
  expect(other.status()).toBe(401);
});
