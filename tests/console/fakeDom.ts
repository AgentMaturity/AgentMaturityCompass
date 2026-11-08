/**
 * A minimal DOM for the console shell tests (vitest runs in node): elements with attributes, classList, dataset, child
 * order and click listeners, the simple selectors the shell uses (tag, .class, #id and their compounds), and a small
 * parser for the markup the shell inserts. It is not a browser; the browser checks are recorded in the fix report.
 */
type Listener = (event: { type: string; preventDefault(): void }) => void;

const VOID = new Set(["input", "br", "img", "meta", "link"]);
const decode = (text: string) => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'").replaceAll("&amp;", "&");

export class FakeElement {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  parent: FakeElement | null = null;
  private ownText = "";

  constructor(readonly ownerDocument: FakeDocument, tag: string) {
    this.tagName = tag.toUpperCase();
  }

  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, String(value)); }
  hasAttribute(name: string): boolean { return this.attributes.has(name); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.hasAttribute(name);
    if (on) this.setAttribute(name, ""); else this.removeAttribute(name);
    return on;
  }

  get id(): string { return this.getAttribute("id") ?? ""; }
  set id(value: string) { this.setAttribute("id", value); }
  set type(value: string) { this.setAttribute("type", value); }
  set title(value: string) { this.setAttribute("title", value); }
  get className(): string { return this.getAttribute("class") ?? ""; }
  set className(value: string) { this.setAttribute("class", value); }
  get hidden(): boolean { return this.hasAttribute("hidden"); }
  set hidden(value: boolean) { this.toggleAttribute("hidden", value); }
  get open(): boolean { return this.hasAttribute("open"); }

  readonly classList = {
    contains: (name: string) => this.className.split(/\s+/).includes(name),
    add: (name: string) => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
    remove: (name: string) => { this.className = this.className.split(/\s+/).filter((entry) => entry && entry !== name).join(" "); },
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classList.contains(name);
      if (on) this.classList.add(name); else this.classList.remove(name);
      return on;
    }
  };

  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(""); }
  set textContent(value: string) { this.ownText = String(value); this.children.splice(0); }
  set innerHTML(html: string) { this.ownText = ""; this.children.splice(0); this.insertAdjacentHTML("beforeend", html); }

  appendChild(child: FakeElement): FakeElement { return this.insertBefore(child, null); }
  insertBefore(child: FakeElement, reference: FakeElement | null): FakeElement {
    child.remove();
    const index = reference === null ? -1 : this.children.indexOf(reference);
    if (index === -1) this.children.push(child); else this.children.splice(index, 0, child);
    child.parent = this;
    return child;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener({ type: "click", preventDefault: () => {} });
  }

  matches(selector: string): boolean {
    const match = /^([a-z0-9]*)((?:\.[\w-]+)*)(?:#([\w-]+))?$/i.exec(selector.trim());
    if (!match) throw new Error(`fakeDom: unsupported selector ${selector}`);
    const [, tag, classes, id] = match;
    return (!tag || this.tagName === tag.toUpperCase())
      && classes.split(".").filter(Boolean).every((name) => this.classList.contains(name))
      && (!id || this.id === id);
  }
  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        if (selector.split(",").some((part) => child.matches(part))) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector: string): FakeElement | null { return this.querySelectorAll(selector)[0] ?? null; }

  /** Parses the shell's own markup: elements, double-quoted or bare attributes, text and the basic entities. */
  insertAdjacentHTML(position: "beforeend", html: string): void {
    if (position !== "beforeend") throw new Error(`fakeDom: unsupported position ${position}`);
    const stack: FakeElement[] = [this];
    for (const token of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
      const [, closing, tag, attrs, text] = token;
      const top = stack[stack.length - 1]!;
      if (text !== undefined) {
        if (text.trim()) top.appendChild(this.ownerDocument.createText(decode(text)));
        continue;
      }
      if (closing) { stack.pop(); continue; }
      const element = this.ownerDocument.createElement(tag!);
      for (const [, name, value] of attrs!.matchAll(/([a-z][\w-]*)(?:="([^"]*)")?/gi)) element.setAttribute(name!, decode(value ?? ""));
      top.appendChild(element);
      if (!VOID.has(tag!.toLowerCase()) && !attrs!.trim().endsWith("/")) stack.push(element);
    }
  }
}

export class FakeDocument {
  readyState = "complete";
  readonly body: FakeElement;
  readonly location = { pathname: "/console/home" };

  constructor() {
    this.body = this.createElement("body");
  }

  createElement(tag: string): FakeElement { return new FakeElement(this, tag); }
  /** A text node is an element named #text whose only content is its text. */
  createText(text: string): FakeElement {
    const node = new FakeElement(this, "#text");
    node.textContent = text;
    return node;
  }
  /** `el("a", { href: "./home" }, "Home")`: builds and returns an element with attributes and text or children. */
  el(tag: string, attrs: Record<string, string> = {}, content: string | FakeElement[] = ""): FakeElement {
    const element = this.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    if (typeof content === "string") element.textContent = content;
    else for (const child of content) element.appendChild(child);
    return element;
  }
  getElementById(id: string): FakeElement | null { return this.body.querySelector(`#${id}`); }
  querySelector(selector: string): FakeElement | null { return this.body.querySelector(selector); }
  querySelectorAll(selector: string): FakeElement[] { return this.body.querySelectorAll(selector); }
  addEventListener(): void {}
}
