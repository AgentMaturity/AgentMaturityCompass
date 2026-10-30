import assert from "node:assert/strict";

const OPERATOR = "/api/v1/operator";

/** P2-22 operator pages driven through real DOM actions; modelled on native-tasks-page.mjs. No internal AMC imports. */
export class OperatorWorkflowPage {
  constructor(page, expect, base) { Object.assign(this, { page, expect, base }); }
  url(name) { return `${this.base}/console/${name}`; }
  async login(credentials) {
    await this.page.goto(`${this.base}/console/login`);
    await this.page.locator("#loginUser").fill(credentials.username);
    await this.page.locator("#loginPass").fill(credentials.password);
    await this.page.locator("#loginBtn").click();
  }
  /** Opens the inbox; it must show items or an unavailable source, never an unqualified all clear. */
  async openInbox() {
    await this.page.goto(this.url("operator-inbox"));
    await this.expect(this.page.locator("#app")).toContainText(/Sources read|Unavailable sources/);
    const text = await this.page.locator("#app").innerText();
    assert.doesNotMatch(text, /all clear/i);
    return text;
  }
  /** Builds a packet for `planDigest` from the form and waits for Studio's 201. */
  async openPacket(planDigest) {
    await this.page.goto(this.url("review-packet"));
    await this.page.locator("#packetPlan").fill(planDigest);
    const response = this.page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === `${OPERATOR}/review-packets`);
    await this.page.locator("#packetBuild").click();
    const reply = await response;
    assert.equal(reply.status(), 201);
    await this.expect(this.page.locator("#packetOut")).toBeVisible();
    return (await reply.json()).data;
  }
  /** Accepts the timing notice when shown, then records `decision` on the first item. */
  async decide(decision = "confirmed") {
    if (await this.page.locator("#timingAccept").count()) await this.page.locator("#timingAccept").click();
    await this.page.locator(`button[data-decision=${decision}]`).first().click();
    await this.expect(this.page.locator("#decisionLog")).toContainText(`Recorded ${decision}`);
  }
}
