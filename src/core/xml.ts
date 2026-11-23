export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

export class XmlError extends Error {
  override name = "XmlError";
}

function throwErr(msg: string): never {
  throw new XmlError(msg);
}

function decodeEntity(s: string, i: number): [string, number] {
  if (s[i] !== "&") return ["&", i];
  let end = s.indexOf(";", i + 1);
  if (end === -1) throwErr("Unterminated entity");
  const ref = s.slice(i + 1, end);
  if (ref === "amp") return ["&", end + 1];
  if (ref === "lt") return ["<", end + 1];
  if (ref === "gt") return [">", end + 1];
  if (ref === "quot") return ['"', end + 1];
  if (ref === "apos") return ["'", end + 1];
  if (ref.startsWith("#")) {
    const hex = ref[1] === "x" || ref[1] === "X";
    const numStr = ref.slice(hex ? 2 : 1);
    const code = parseInt(numStr, hex ? 16 : 10);
    if (Number.isNaN(code)) throwErr("Invalid numeric entity");
    return [String.fromCodePoint(code), end + 1];
  }
  // Unknown entity: keep literally as "&name;"
  return ["&" + ref + ";", end + 1];
}

function decode(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ampIdx = s.indexOf("&", i);
    if (ampIdx === -1) {
      out += s.slice(i);
      break;
    }
    if (ampIdx > i) {
      out += s.slice(i, ampIdx);
    }
    const [ch, next] = decodeEntity(s, ampIdx);
    out += ch;
    i = next;
  }
  return out;
}

function encodeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function encodeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function skipWhitespace(s: string, i: number): number {
  while (i < s.length) {
    const ch = s.charCodeAt(i);
    if (ch !== 32 && ch !== 9 && ch !== 10 && ch !== 13) break;
    i++;
  }
  return i;
}

function readName(s: string, i: number): [string, number] {
  let start = i;
  if (i >= s.length) throwErr("Expected name");
  const first = s.charCodeAt(i);
  if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95)) {
    throwErr("Expected name");
  }
  while (i < s.length) {
    const ch = s.charCodeAt(i);
    if (!((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || (ch >= 48 && ch <= 57) || ch === 95 || ch === 45 || ch === 46 || ch === 58)) {
      break;
    }
    i++;
  }
  return [s.slice(start, i), i];
}

function readQuotedValue(s: string, i: number): [string, number] {
  const quote = s[i];
  if (quote !== '"' && quote !== "'") throwErr("Expected quoted value");
  i++;
  let start = i;
  while (i < s.length && s[i] !== quote) i++;
  if (i >= s.length) throwErr("Unterminated attribute value");
  const val = decode(s.slice(start, i));
  return [val, i + 1];
}

function skipComment(s: string, i: number): number {
  if (!s.startsWith("<!--", i)) throwErr("Expected comment");
  let end = s.indexOf("-->", i);
  if (end === -1) throwErr("Unterminated comment");
  return end + 3;
}

function skipProcessingInstruction(s: string, i: number): number {
  if (!s.startsWith("<?", i)) throwErr("Expected PI");
  let end = s.indexOf("?>", i);
  if (end === -1) throwErr("Unterminated PI");
  return end + 2;
}

function skipDoctype(s: string, i: number): number {
  if (!s.startsWith("<!DOCTYPE", i)) throwErr("Expected DOCTYPE");
  let depth = 0;
  i += 9;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    else if (ch === ">" && depth === 0) return i + 1;
    i++;
  }
  throwErr("Unterminated DOCTYPE");
}

function parseAttributes(s: string, i: number): [Record<string, string>, number] {
  const attrs: Record<string, string> = {};
  while (true) {
    i = skipWhitespace(s, i);
    if (i >= s.length || s[i] === ">" || s[i] === "/") break;
    const [name, nextI] = readName(s, i);
    i = skipWhitespace(s, nextI);
    if (s[i] !== "=") throwErr("Expected '=' in attribute");
    i++;
    i = skipWhitespace(s, i);
    const [val, attrEnd] = readQuotedValue(s, i);
    attrs[name] = val;
    i = attrEnd;
  }
  return [attrs, i];
}

function parseElement(s: string, i: number): [XmlElement, number] {
  if (s[i] !== "<") throwErr("Expected '<'");
  i++;
  const [name, nextI] = readName(s, i);
  i = skipWhitespace(s, nextI);
  const [attrs, attrEnd] = parseAttributes(s, i);
  i = skipWhitespace(s, attrEnd);
  if (s[i] === "/") {
    i++;
    if (s[i] !== ">") throwErr("Expected '>'");
    return [{ name, attrs, children: [], text: "" }, i + 1];
  }
  if (s[i] !== ">") throwErr("Expected '>'");
  i++;

  const children: XmlElement[] = [];
  let text = "";
  while (true) {
    if (i >= s.length) throwErr("Unexpected end of input");
    if (s[i] === "<") {
      if (s.startsWith("</", i)) break;
      if (s.startsWith("<!--", i)) {
        i = skipComment(s, i);
        continue;
      }
      if (s.startsWith("<?", i)) {
        i = skipProcessingInstruction(s, i);
        continue;
      }
      if (s.startsWith("<![CDATA[", i)) {
        const end = s.indexOf("]]>", i);
        if (end === -1) throwErr("Unterminated CDATA");
        text += s.slice(i + 9, end);
        i = end + 3;
        continue;
      }
      const [child, childEnd] = parseElement(s, i);
      children.push(child);
      i = childEnd;
      continue;
    }
    let textEnd = s.indexOf("<", i);
    if (textEnd === -1) throwErr("Missing closing tag");
    text += decode(s.slice(i, textEnd));
    i = textEnd;
  }

  // Closing tag
  if (!s.startsWith("</", i)) throwErr("Expected closing tag");
  i += 2;
  const [closeName, closeI] = readName(s, i);
  if (closeName !== name) throwErr(`Mismatched tags: ${name} vs ${closeName}`);
  i = skipWhitespace(s, closeI);
  if (s[i] !== ">") throwErr("Expected '>'");
  return [{ name, attrs, children, text }, i + 1];
}

export function parseXml(source: string): XmlElement {
  let s = source;
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  let i = skipWhitespace(s, 0);
  while (i < s.length) {
    if (s.startsWith("<?XML", i)) {
      i = skipProcessingInstruction(s, i);
      i = skipWhitespace(s, i);
      continue;
    }
    if (s.startsWith("<!--", i)) {
      i = skipComment(s, i);
      i = skipWhitespace(s, i);
      continue;
    }
    if (s.startsWith("<?", i)) {
      i = skipProcessingInstruction(s, i);
      i = skipWhitespace(s, i);
      continue;
    }
    if (s.startsWith("<!DOCTYPE", i)) {
      i = skipDoctype(s, i);
      i = skipWhitespace(s, i);
      continue;
    }
    break;
  }
  if (i >= s.length) throwErr("No root element");
  const [root, end] = parseElement(s, i);
  i = skipWhitespace(s, end);
  if (i < s.length) throwErr("Content after root element");
  return root;
}

export function localName(name: string): string {
  const idx = name.indexOf(":");
  return idx === -1 ? name : name.slice(idx + 1);
}

export function childrenNamed(el: XmlElement, local: string): XmlElement[] {
  return el.children.filter(c => localName(c.name) === local);
}

export function child(el: XmlElement, local: string): XmlElement | undefined {
  for (const c of el.children) {
    if (localName(c.name) === local) return c;
  }
  return undefined;
}

function collectDescendants(el: XmlElement, local: string, out: XmlElement[]): void {
  for (const c of el.children) {
    if (localName(c.name) === local) out.push(c);
    collectDescendants(c, local, out);
  }
}

export function descendantsNamed(el: XmlElement, local: string): XmlElement[] {
  const out: XmlElement[] = [];
  collectDescendants(el, local, out);
  return out;
}

export function attr(el: XmlElement, local: string): string | undefined {
  for (const [k, v] of Object.entries(el.attrs)) {
    if (localName(k) === local) return v;
  }
  return undefined;
}

function writeIndent(depth: number): string {
  return "  ".repeat(depth);
}

function buildAttrsStr(el: XmlElement): string {
  let attrsStr = "";
  for (const [k, v] of Object.entries(el.attrs)) {
    attrsStr += ` ${encodeAttr(k)}="${encodeAttr(v)}"`;
  }
  return attrsStr;
}

function serialize(el: XmlElement, depth: number): string {
  const indent = writeIndent(depth);
  const hasChildren = el.children.length > 0;
  const hasText = el.text.length > 0;
  const attrsStr = buildAttrsStr(el);
  if (!hasChildren && !hasText) {
    return `${indent}<${el.name}${attrsStr} />`;
  }
  if (!hasChildren && hasText) {
    return `${indent}<${el.name}${attrsStr}>${encodeText(el.text)}</${el.name}>`;
  }
  let out = `${indent}<${el.name}${attrsStr}>`;
  if (el.text.trim()) out += encodeText(el.text); // whitespace between child elements is layout, not content
  for (const c of el.children) {
    out += "\n" + serialize(c, depth + 1);
  }
  out += `\n${indent}</${el.name}>`;
  return out;
}

export function writeXml(root: XmlElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + serialize(root, 0);
}
