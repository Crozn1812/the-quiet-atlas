// Minimal in-memory DOM for React unit tests; no browser or extra dependency.
import { vi } from "vitest";

export class TestElement extends EventTarget {
  nodeType = 1;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  parentNode: TestElement | null = null;
  childNodes: TestElement[] = [];
  attributes = new Map<string, string>();
  style = {};
  value = "";
  disabled = false;
  inert = false;
  scrollTop = 0;
  tabIndex = -1;
  private text = "";

  constructor(public tagName: string, public ownerDocument: TestDocument) {
    super();
    this.tagName = tagName.toUpperCase();
  }

  get nodeName() { return this.tagName; }
  get parentElement() { return this.parentNode; }
  get firstChild(): TestElement | null { return this.childNodes[0] ?? null; }
  get lastChild(): TestElement | null { return this.childNodes.at(-1) ?? null; }
  get nextSibling(): TestElement | null {
    return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null;
  }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  get isConnected(): boolean { return this === this.ownerDocument.body || Boolean(this.parentNode?.isConnected); }
  get open() { return this.attributes.has("open"); }
  get textContent(): string { return this.text + this.childNodes.map(node => node.textContent).join(""); }
  set textContent(value: string) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.text = value;
  }
  set nodeValue(value: string) { this.textContent = value; }
  get nodeValue() { return this.textContent; }

  appendChild(child: TestElement) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  append(...children: TestElement[]) { children.forEach(child => this.appendChild(child)); }
  removeChild(child: TestElement) {
    this.childNodes.splice(this.childNodes.indexOf(child), 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(child: TestElement, before: TestElement) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.childNodes.splice(this.childNodes.indexOf(before), 0, child);
    return child;
  }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  setAttributeNS(_namespace: string, name: string, value: string) { this.setAttribute(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  showModal() { this.setAttribute("open", ""); }
  close() { this.removeAttribute("open"); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(child: TestElement): boolean { return child === this || this.childNodes.some(node => node.contains(child)); }

  matches(selector: string): boolean {
    return selector.split(",").some(part => {
      const rule = part.trim();
      if (rule.includes(":not(dialog)") && this.tagName === "DIALOG") return false;
      if (rule.includes(":not(:disabled)") && this.disabled) return false;
      if (rule.includes("[contenteditable='false']") && this.getAttribute("contenteditable") === "false") return false;
      const base = rule.replace(/:not\([^)]*\)/g, "");
      const tag = /^[a-z][\w-]*/i.exec(base)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const id = /#([\w-]+)/.exec(base)?.[1];
      if (id && this.getAttribute("id") !== id) return false;
      return [...base.matchAll(/\[([\w-]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g)].every(([, name, value]) =>
        this.attributes.has(name!) && (value === undefined || this.getAttribute(name!) === value));
    });
  }
  closest(selector: string): TestElement | null {
    return this.matches(selector) ? this : this.parentNode?.closest(selector) ?? null;
  }
  querySelectorAll<T extends TestElement = TestElement>(selector: string): T[] {
    return this.childNodes.flatMap(child => [
      ...(child.nodeType === 1 && child.matches(selector) ? [child as T] : []),
      ...child.querySelectorAll<T>(selector),
    ]);
  }
  querySelector<T extends TestElement = TestElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  click() {
    const event = new Event("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: this });
    // EventTarget supplies listeners, while this small DOM supplies bubbling.
    function bubble(node: TestElement) {
      node.dispatchEvent(event);
      if (!event.cancelBubble && node.parentNode) bubble(node.parentNode);
    }
    bubble(this);
  }
}

class TestDocument extends EventTarget {
  nodeType = 9;
  body = new TestElement("body", this);
  documentElement = this.body;
  activeElement: TestElement = this.body;
  defaultView: unknown;
  createElement(tag: string) { return new TestElement(tag, this); }
  createElementNS(_namespace: string, tag: string) { return this.createElement(tag); }
  createTextNode(text: string) {
    const node = this.createElement("#text");
    node.nodeType = 3;
    node.textContent = text;
    return node;
  }
  querySelector(selector: string) { return this.body.querySelector(selector); }
}

export function installJournalDOM(reducedMotion = true) {
  const document = new TestDocument();
  const window = Object.assign(new EventTarget(), {
    document,
    HTMLIFrameElement: class {},
    matchMedia: () => ({ matches: reducedMotion }),
  });
  document.defaultView = window;
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("HTMLElement", TestElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const shell = document.createElement("div");
  shell.setAttribute("data-app-mode", "world");
  const container = document.createElement("div");
  const trigger = document.createElement("button");
  shell.append(container, trigger);
  document.body.append(shell);
  container.focus();
  return { document, window, shell, container, trigger };
}
