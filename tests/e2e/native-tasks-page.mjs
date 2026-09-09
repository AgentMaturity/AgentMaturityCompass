import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { NATIVE_STUDIO_SCENARIOS } from "../../scripts/lib/nativeStudioBrowserReceipt.mjs";

const digest = text => createHash("sha256").update(text).digest("hex");
const NATIVE = "/api/v1/native-tasks";
const unwrap = async response => {
  const body = await response.json();
  assert.equal(response.ok(), true, `HTTP ${response.status()} from ${new URL(response.url()).pathname}`);
  assert.equal(body.ok, true); return body.data;
};

/** Real DOM actions and authenticated reads; no internal AMC imports or fabricated API output. */
export class NativeTasksPage {
  constructor(page, expect, base, agent) { Object.assign(this, { page, expect, base, agent }); }
  url(page = "native-tasks") { return `${this.base}/console/${page}?agent=${encodeURIComponent(this.agent)}`; }
  async open(credentials) {
    await this.page.goto(this.url());
    await this.page.locator("#nativeTaskProvider, #loginUser").first().waitFor({ state: "visible" });
    if (await this.page.locator("#loginUser").count()) {
      assert.ok(credentials, "Owner login credentials are required");
      await this.page.locator("#loginUser").fill(credentials.username);
      await this.page.locator("#loginPass").fill(credentials.password);
      await this.page.locator("#loginBtn").click();
    }
    await this.expect(this.page.locator("#nativeTaskProvider option[value=stub]")).toHaveCount(1);
    await this.expect(this.page.locator("#nativeTaskAgent")).toHaveValue(this.agent);
  }
  async json(path) {
    // Deliberately ordinary browser fetch: same cookie identity as the rendered page.
    const result = await this.page.evaluate(async url => {
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      return { status: response.status, body: await response.json() };
    }, `${this.base}${path}`);
    assert.equal(result.status, 200); assert.equal(result.body.ok, true); return result.body.data;
  }
  async options() { return this.json(`${NATIVE}/options?agentId=${encodeURIComponent(this.agent)}`); }
  async task() {
    const id = new URL(this.page.url()).searchParams.get("task"); assert.ok(id, "The accepted task ID must be in the URL");
    return (await this.json(`${NATIVE}/${id}?agentId=${encodeURIComponent(this.agent)}`)).task;
  }
  async create(prompt, tools = "none") {
    await this.page.locator("#nativeTaskProvider").selectOption("stub");
    if (await this.page.locator("#nativeTaskTools").isEnabled()) await this.page.locator("#nativeTaskTools").selectOption(tools);
    else await this.expect(this.page.locator("#nativeTaskTools")).toHaveValue(tools);
    await this.page.locator("#nativeTaskPrompt").fill(prompt);
    const response = this.page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith(NATIVE));
    await this.page.locator("#nativeTaskSubmit").click();
    const view = await unwrap(await response);
    await this.expect.poll(() => new URL(this.page.url()).searchParams.get("task")).toBe(view.taskId);
    assert.equal(view.agentId, this.agent); assert.equal(view.provider, "stub"); assert.equal(view.tools, tools);
    return view;
  }
  async ready() {
    await this.expect(this.page.locator("#nativeTaskState")).toHaveText("Ready for another turn", { timeout: 45_000 });
    const task = await this.task(); assert.equal(task.state, "idle"); assert.ok(task.sessionId); return task;
  }
  async control(action) {
    const name = { release: "Release", resume: "Resume", cancel: "Cancel", verify: "Verify", archive: "Archive" }[action];
    const before = await this.task();
    const response = this.page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith(`/${before.taskId}/${action}`));
    await this.page.locator(`#nativeTask${name}`).click();
    const actual = await response;
    assert.equal(actual.request().postDataJSON().expectedRevision, before.revision);
    assert.equal(new URL(actual.url()).searchParams.get("agentId"), this.agent);
    return unwrap(actual);
  }
  async newTask() {
    await this.page.locator("#nativeTaskNew").click();
    await this.expect.poll(() => new URL(this.page.url()).searchParams.get("task")).toBe(null);
  }
}

export async function runNativeStudioScenarios({ browser, expect, fixture, credentials, out, step, note, requests, sessions }) {
  const recordStep = step;
  const startedScenarios = new Set();
  step = async (name, run) => {
    assert.ok(NATIVE_STUDIO_SCENARIOS.includes(name), `Undeclared native browser scenario: ${name}`);
    assert.ok(!startedScenarios.has(name), `Duplicate native browser scenario: ${name}`);
    startedScenarios.add(name);
    return recordStep(name, run);
  };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  const allowed = new Set([new URL(fixture.ownerBase).origin, new URL(fixture.demoBase).origin]);
  await context.route("**/*", route => allowed.has(new URL(route.request().url()).origin) ? route.continue() : route.abort("blockedbyclient"));
  const page = await context.newPage();
  page.on("pageerror", error => note("page-error", error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (request.method() !== "POST" || !url.pathname.includes(NATIVE)) return;
    const body = request.postDataJSON(), headers = request.headers();
    requests.push({ path: url.pathname, agentId: url.searchParams.get("agentId") ?? body.agentId ?? null,
      clientRequestId: body.clientRequestId ?? null, expectedRevision: body.expectedRevision ?? null,
      promptSha256: typeof body.prompt === "string" ? digest(body.prompt) : null,
      intent: headers["x-amc-native-intent"] ?? null, csrfPresent: typeof headers["x-amc-native-csrf"] === "string" });
  });
  const ui = new NativeTasksPage(page, expect, fixture.ownerBase, fixture.agentId);
  try {
    await step("owner-login-and-missing-credential", async () => {
      await ui.open(credentials); const config = await ui.options();
      assert.equal(config.demo, false); assert.equal(config.executionBlocked, false);
      const openai = config.providers.find(item => item.id === "openai");
      assert.equal(openai?.credential.configured, false, "Fixture must contain no real provider credentials");
      await page.locator("#nativeTaskProvider").selectOption("openai");
      await page.locator("#nativeTaskModel").fill("no-model-request-will-run");
      await expect(page.locator("#nativeTaskCredential")).toContainText("Configure OPENAI_API_KEY");
      await expect(page.locator("#nativeTaskSubmit")).toBeDisabled();
      return { actorMode: "owner cookie", nondefaultAgent: fixture.agentId, providerInspectedOnly: "openai" };
    });
    if (fixture.knownHomeFailureReceipt) {
      note("known-product-failure-not-rerun", "Home handoff remains failed in the linked same-artifact receipt. Continuing directly on selected native page.");
    } else try { await step("rendered-layout-keyboard-and-home-handoff", async () => {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator("#nativeTasksTitle")).toBeVisible();
        const bounds = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(bounds.scroll <= bounds.client + 1, `Unexpected horizontal overflow at ${width}px`);
        await page.screenshot({ path: join(out, `native-setup-${width}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator("#nativeTaskProvider").focus(); await page.keyboard.press("Tab");
      assert.equal(await page.locator("#nativeTaskModel").evaluate(node => node === document.activeElement), true);
      await page.goto(ui.url("home"));
      await page.locator("#firstUseNativeButton").click();
      await expect(page.locator("#nativeGuideCommand")).toContainText(`--agent='${fixture.agentId}'`);
      await page.locator("#copyNativeGuide").click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(copied, `amc --agent='${fixture.agentId}' agent-loop guide`);
      await page.getByRole("link", { name: "Open Native Tasks", exact: true }).click();
      await expect(page.locator("#nativeTaskAgent")).toHaveValue(fixture.agentId);
      return { widths: [1280, 390], clipboardAgent: fixture.agentId };
    }); } catch (error) {
      // Independent native lifecycle work can continue despite a failed Home handoff.
      // The failed check remains in the receipt and prevents overall acceptance.
      await page.screenshot({path:join(out,"failed-home-handoff.png"),fullPage:true});
      note("explicit-recovery-navigation", "Home handoff check failed; continuing directly on the same selected agent native page. The failed assertion remains authoritative.");
      await ui.open(credentials);
    }
    let first;
    if (!fixture.knownResumeFailureReceipt) await step("selected-agent-committed-task-and-follow-up", async () => {
      const prompt = `Browser native first turn ${randomUUID()}`;
      await ui.create(prompt); first = await ui.ready(); sessions.add(first.sessionId);
      await expect(page.locator(".native-task-event-assistant")).toContainText(prompt);
      assert.equal(await page.locator(".native-task-event-assistant").last().getByText(/Recorded/).count(), 1);
      const next = `Browser native second turn ${randomUUID()}`;
      await page.locator("#nativeTaskPrompt").fill(next);
      await page.locator("#nativeTaskSubmit").click();
      await expect.poll(async () => (await ui.task()).revision).toBe(first.revision + 1);
      const after = await ui.ready();
      await expect(page.locator("#nativeTaskTranscript")).toContainText(next);
      await expect(page.locator("#nativeTaskTranscript")).toContainText(prompt);
      assert.equal(after.sessionId, first.sessionId);
      await page.screenshot({ path: join(out, "native-committed-transcript.png"), fullPage: true });
      return { taskId: after.taskId, sessionId: after.sessionId, revision: after.revision, evidence: "committed; full verification separate" };
    });
    if (!fixture.knownResumeFailureReceipt) await step("release-reload-explicit-resume", async () => {
      const before = await ui.task(); const released = await ui.control("release"); assert.equal(released.state, "released");
      const mutations = requests.length;
      await page.reload(); await expect(page.locator("#nativeTaskResume")).toBeVisible();
      assert.equal(requests.length, mutations, "Reload must not dispatch or resume");
      await ui.control("resume"); const resumed = await ui.ready(); assert.equal(resumed.sessionId, before.sessionId);
      await ui.control("release"); await ui.newTask();
      return { sessionId: resumed.sessionId, reloadMutationCount: 0 };
    });
    await step("lost-create-acknowledgement-never-replayed", async () => {
      const prompt = `Lost acknowledgement fixture ${randomUUID()}`, edited = `Preserved next draft ${randomUUID()}`;
      let accepted, releaseAbort, resolveAccepted;
      const acceptedPromise = new Promise(resolve => { resolveAccepted = resolve; });
      const abortPermission = new Promise(resolve => { releaseAbort = resolve; });
      const routeHandler = async route => {
        const req = route.request();
        if (req.method() !== "POST" || !new URL(req.url()).pathname.endsWith(NATIVE)) return route.fallback();
        const response = await route.fetch({ maxRetries: 0 }); accepted = await unwrap(response); resolveAccepted();
        await abortPermission; await route.abort("connectionreset");
      };
      await page.route(`**${NATIVE}`, routeHandler);
      try {
        await page.locator("#nativeTaskProvider").selectOption("stub"); await page.locator("#nativeTaskPrompt").fill(prompt);
        await page.locator("#nativeTaskSubmit").click();
        await Promise.race([acceptedPromise, new Promise((_, reject) => { const timer=setTimeout(()=>reject(new Error("Lost-ack server acceptance deadline exceeded")),45_000);timer.unref(); })]);
        await page.locator("#nativeTaskPrompt").fill(edited); releaseAbort();
        await expect(page.locator("#nativeTaskNotice")).toContainText("Submission outcome unknown");
        await expect(page.locator("#nativeTaskSubmit")).toBeDisabled();
        await page.locator("#nativeTaskRefresh").click();
        await expect.poll(() => new URL(page.url()).searchParams.get("task")).toBe(accepted.taskId);
        await ui.ready(); sessions.add(accepted.sessionId);
        await expect(page.locator("#nativeTaskPrompt")).toHaveValue(edited);
        const matching = requests.filter(row => row.clientRequestId === accepted.clientRequestId);
        assert.equal(matching.length, 1, "The browser must submit the accepted UUID once only");
        const all = await ui.json(`${NATIVE}?agentId=${encodeURIComponent(fixture.agentId)}`);
        assert.equal(all.tasks.filter(task => task.clientRequestId === accepted.clientRequestId).length, 1);
        await ui.control("release"); await ui.newTask();
        return { taskId: accepted.taskId, requestId: accepted.clientRequestId, browserPosts: 1, acceptedTasks: 1, editedDraftPreserved: true };
      } finally { releaseAbort?.(); await page.unroute(`**${NATIVE}`, routeHandler); }
    });
    for (const kind of ["create", "turn"]) await step(`unreceived-${kind}-explicit-identical-retry`, async () => {
      let before = null;
      if (kind === "turn") {
        await ui.create(`Retry follow-up parent ${randomUUID()}`);
        before = await ui.ready(); sessions.add(before.sessionId);
      }
      const prompt = `Unreceived ${kind} ${randomUUID()}`, edited = `Later draft ${randomUUID()}`;
      const sentBodies = [], pattern = kind === "create" ? `**${NATIVE}` : `**${NATIVE}/${before.taskId}/turn?*`;
      let attempts = 0;
      const handler = async route => {
        const request = route.request();
        if (request.method() !== "POST") return route.fallback();
        sentBodies.push(request.postData()); attempts++;
        // First request never reaches Studio. The next attempt receives a real
        // CSRF refusal, which cannot establish non-admission of the first one.
        if (attempts === 1) return route.abort("connectionreset");
        if (attempts === 2) {
          const response = await route.fetch({ maxRetries: 0,
            headers: { ...request.headers(), "x-amc-native-csrf": "deliberately-invalid-retry-csrf" } });
          assert.equal(response.status(), 403); return route.fulfill({ response });
        }
        return route.continue();
      };
      await page.route(pattern, handler);
      try {
        if (kind === "create") await page.locator("#nativeTaskProvider").selectOption("stub");
        await page.locator("#nativeTaskPrompt").fill(prompt);
        await page.locator("#nativeTaskSubmit").click();
        await expect(page.locator("#nativeTaskNotice")).toContainText("Submission outcome unknown");
        await page.locator("#nativeTaskPrompt").fill(edited);
        await expect(page.locator("#nativeTaskRetry")).toBeDisabled();
        await expect(page.locator("#nativeTaskSubmit")).toBeDisabled();

        // A failed options refresh must leave recovery reachable, even though
        // stale setup is discarded. No admission is fabricated by this fault.
        const optionsPattern = `**${NATIVE}/options?*`;
        const failOptions = route => route.abort("connectionreset");
        await page.route(optionsPattern, failOptions);
        try {
          await page.locator("#nativeTaskRefresh").click();
          await expect(page.locator("#nativeTaskError")).toBeVisible();
          await expect(page.locator("#nativeTaskRefresh")).toBeEnabled();
          await expect(page.locator("#nativeTaskRetry")).toBeDisabled();
        } finally { await page.unroute(optionsPattern, failOptions); }

        await page.locator("#nativeTaskRefresh").click();
        await expect(page.locator("#nativeTaskRetry")).toBeEnabled();
        assert.equal(attempts, 1, "Status refresh must never submit");
        if (before) assert.equal((await ui.task()).revision, before.revision);
        await page.locator("#nativeTaskRetry").click();
        await expect(page.locator("#nativeTaskError")).toContainText(/sign in|csrf|origin/i);
        await expect(page.locator("#nativeTaskRetry")).toBeDisabled();
        await expect(page.locator("#nativeTaskSubmit")).toBeDisabled();
        await expect(page.locator("#nativeTaskPrompt")).toHaveValue(edited);

        await page.locator("#nativeTaskRefresh").click();
        await expect(page.locator("#nativeTaskRetry")).toBeEnabled();
        const admittedResponse = page.waitForResponse(response => response.request().method() === "POST"
          && JSON.stringify(response.request().postDataJSON()) === JSON.stringify(JSON.parse(sentBodies[0])) && response.status() === 202);
        await page.locator("#nativeTaskRetry").click();
        const admitted = await unwrap(await admittedResponse);
        await expect.poll(() => new URL(page.url()).searchParams.get("task")).toBe(admitted.taskId);
        const ready = await ui.ready(); sessions.add(ready.sessionId);
        await expect(page.locator("#nativeTaskRetry")).toBeHidden();
        await expect(page.locator("#nativeTaskPrompt")).toHaveValue(edited);
        assert.equal(attempts, 3); assert.equal(new Set(sentBodies).size, 1, "All attempts must retain the exact original body");
        const original = JSON.parse(sentBodies[0]); assert.equal(original.prompt, prompt);
        if (before) {
          assert.equal(original.expectedRevision, before.revision); assert.equal(ready.revision, before.revision + 1);
          assert.equal(ready.sessionId, before.sessionId);
        } else {
          const list = await ui.json(`${NATIVE}?agentId=${encodeURIComponent(fixture.agentId)}`);
          assert.equal(list.tasks.filter(task => task.clientRequestId === original.clientRequestId).length, 1);
        }
        await expect(page.locator(".native-task-event-user").filter({ hasText: prompt })).toHaveCount(1);
        await ui.control("release"); await ui.newTask();
        return { taskId: ready.taskId, sessionId: ready.sessionId, requestId: original.clientRequestId,
          attempts, requestBodyIdentical: true, revisedDraftPreserved: true, firstAttemptReachedServer: false,
          refusedRetry: "real CSRF check", failedRefreshRecoverable: true };
      } finally { await page.unroute(pattern, handler); }
    });
    await step("real-pending-approval-link-and-denial", async () => {
      assert.equal((await ui.options()).scope.ready, true, "CLI fixture must provide signed workspace policy and reviewer quorum");
      await ui.create(`Request governed stub tool ${randomUUID()}`, "workspace");
      const link=page.getByRole("link", { name: /Review approval/ }).first(); await expect(link).toBeVisible({ timeout: 30_000 });
      const task=await ui.task(); assert.equal(task.state,"running"); assert.ok(task.approvals.length); sessions.add(task.sessionId);
      const approval=task.approvals[0], href=await link.getAttribute("href");
      assert.equal(new URL(href,page.url()).searchParams.get("approval"),approval.approvalRequestId);
      const popupPromise=page.waitForEvent("popup"); await link.click(); const popup=await popupPromise;
      try {
        await expect(popup.locator("#apprRows")).toContainText(approval.approvalRequestId);
        popup.once("dialog", dialog=>dialog.accept("Browser acceptance denies the actual synthetic tool request."));
        await popup.locator(`[data-deny="${approval.approvalRequestId}"]`).click();
        await expect(popup.locator("#apprRows")).toContainText("DENIED");
      } finally { await popup.close(); }
      const after=await ui.ready(); await expect(page.locator("#nativeTaskTranscript")).toContainText(/denied|failed/i);
      await ui.control("release"); await ui.newTask();
      return { taskId:task.taskId,sessionId:task.sessionId,approvalRequestId:approval.approvalRequestId,quorum:approval.required,decision:"DENY",note:"Stub requests a synthetic argument shape; no successful coding/editing effect is claimed." };
    });
    await step("cancel-actual-turn-waiting-for-approval", async () => {
      await ui.create(`Cancel governed stub request ${randomUUID()}`,"workspace");
      await expect(page.getByRole("link",{name:/Review approval/}).first()).toBeVisible({timeout:30_000});
      const before=await ui.task(); assert.equal(before.state,"running"); assert.ok(before.approvals.length); sessions.add(before.sessionId);
      await ui.control("cancel");
      await expect.poll(async()=> (await ui.task()).turnEndReason,{timeout:30_000}).toBe("cancelled");
      const ended=await ui.task(); assert.ok(!["running","starting","cancel-requested"].includes(ended.state));
      await ui.control("release");
      return {taskId:before.taskId,sessionId:before.sessionId,ending:ended.turnEndReason};
    });
    await step("browser-verification-control-reports-actual-verdict", async () => {
      const before=await ui.task(); const verified=await ui.control("verify");
      assert.equal(verified.sessionId,before.sessionId);
      assert.ok(["workspace-key-consistency","externally-anchored","failed"].includes(verified.verification));
      const text={"workspace-key-consistency":"Verified against workspace keys","externally-anchored":"Verified against an independent trust anchor",failed:"Evidence verification failed"}[verified.verification];
      await expect(page.locator("#nativeTaskVerification")).toContainText(text);
      return {sessionId:before.sessionId,verification:verified.verification,note:"Checks faithful presentation of the actual verifier result; cold cryptographic acceptance is independently required after shutdown."};
    });
    await step("explicit-closed-task-archive-retains-inspection", async () => {
      await ui.newTask();
      const prompt = `Archived retained conversation ${randomUUID()}`;
      await ui.create(prompt); const ready = await ui.ready(); sessions.add(ready.sessionId);
      await expect(page.locator("#nativeTaskArchive")).toBeHidden();
      const closed = await ui.control("verify");
      assert.equal(closed.state, "closed"); assert.equal(closed.archived, false);
      await expect(page.locator("#nativeTaskArchive")).toBeVisible();
      const archived = await ui.control("archive");
      assert.equal(archived.archived, true); assert.equal(archived.state, "closed");
      assert.equal(archived.sessionId, ready.sessionId); assert.equal(archived.revision, ready.revision);
      assert.equal(archived.clientRequestId, ready.clientRequestId);
      await expect(page.locator("#nativeTaskState")).toHaveText("Archived");
      await expect(page.locator("#nativeTaskArchive")).toBeHidden();
      await expect(page.locator("#nativeTaskResume")).toBeHidden();
      await expect(page.locator("#nativeTaskSubmit")).toBeDisabled();
      const item = page.locator(`[data-native-task-id="${ready.taskId}"]`);
      await expect(item).toHaveCount(0);
      await page.locator("#nativeTaskIncludeArchived").check();
      await expect(item).toHaveCount(1); await expect(item).toContainText("Archived");
      await ui.newTask(); await item.click();
      await expect(page.locator("#nativeTaskState")).toHaveText("Archived");
      await expect(page.locator("#nativeTaskTranscript")).toContainText(prompt);
      const postCount = requests.length;
      await page.reload();
      await expect(page.locator("#nativeTaskState")).toHaveText("Archived");
      await expect(page.locator("#nativeTaskTranscript")).toContainText(prompt);
      assert.equal(requests.length, postCount, "Archived reload must not resume or dispatch");
      assert.equal((await ui.task()).sessionId, ready.sessionId);
      await ui.newTask();
      return { taskId: ready.taskId, sessionId: ready.sessionId, revision: ready.revision,
        signedHistoryRetained: true, defaultListExcluded: true, explicitArchivedInspection: true,
        reloadMutationCount: 0, evidenceVerification: closed.verification };
    });
    await step("native-write-browser-proof-and-agent-binding", async () => {
      assert.ok(requests.length>0);
      for(const request of requests) { assert.equal(request.intent,"task-workspace-v1");assert.equal(request.csrfPresent,true);assert.equal(request.agentId,fixture.agentId); }
      return {nativeRequests:requests.length,cookieCsrfPresent:true,agentId:fixture.agentId};
    });
  } catch(error) {
    await page.screenshot({path:join(out,"failed-owner-scenario.png"),fullPage:true}).catch(()=>{});
    throw error;
  } finally { await context.close(); }

  const demoContext=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:"block"});
  const demoPage=await demoContext.newPage(); const demo=new NativeTasksPage(demoPage,expect,fixture.demoBase,"default");
  try {
    await step("demo-stub-only-and-approval-refusal",async()=>{
      await demo.open(); const config=await demo.options(); assert.equal(config.demo,true);
      assert.deepEqual(config.providers.map(p=>p.id),["stub"]);assert.equal(config.scope.ready,false);
      await expect(demoPage.locator("#nativeTaskTools")).toHaveValue("none");await expect(demoPage.locator("#nativeTaskTools")).toBeDisabled();
      const request=await demo.create(`Explicit browser local demo ${randomUUID()}`); await demo.ready(); await demo.control("release");
      await demoPage.goto(demo.url("approvals"));
      await expect(demoPage.locator("#app")).toContainText("Demo sessions cannot decide approvals");
      assert.equal(await demoPage.locator("[data-approve],[data-deny],[data-sim]").count(),0);
      const refused=await demoPage.evaluate(async base=>{const opt=await(await fetch(`${base}/api/v1/native-tasks/options?agentId=default`,{credentials:"include"})).json();
        const response=await fetch(`${base}/approvals/requests/nonexistent-fixture-id/decide`,{method:"POST",credentials:"include",headers:{"content-type":"application/json","x-amc-native-intent":"task-workspace-v1","x-amc-native-csrf":opt.data.nativeCsrfToken},body:JSON.stringify({decision:"APPROVE_EXECUTE",reason:"Expected demo refusal"})});return response.status;},fixture.demoBase);
      assert.equal(refused,403);
      await demoPage.screenshot({path:join(out,"native-demo-approval-refused-390.png"),fullPage:true});
      return {taskId:request.taskId,provider:"stub",tools:"none",approvalStatus:refused};
    });
  } catch(error) {
    await demoPage.screenshot({path:join(out,"failed-demo-scenario.png"),fullPage:true}).catch(()=>{});
    throw error;
  } finally { await demoContext.close(); }
}
