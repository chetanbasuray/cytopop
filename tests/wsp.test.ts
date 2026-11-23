import { expect, test } from "bun:test";
import { parseXml, writeXml, XmlError, localName, childrenNamed, child, attr } from "../src/core/xml";
import { readWsp } from "../src/core/wsp";

const NS = 'xmlns:gating="http://www.isac-net.org/std/Gating-ML/v2.0/gating" xmlns:transforms="http://www.isac-net.org/std/Gating-ML/v2.0/transformations" xmlns:data-type="http://www.isac-net.org/std/Gating-ML/v2.0/datatypes"';
const dim = (name: string, min?: number, max?: number) =>
  `<gating:dimension${min === undefined ? "" : ` gating:min="${min}"`}${max === undefined ? "" : ` gating:max="${max}"`}><data-type:fcs-dimension data-type:name="${name}"/></gating:dimension>`;
const vertex = (x: number, y: number) => `<gating:vertex><gating:coordinate data-type:value="${x}"/><gating:coordinate data-type:value="${y}"/></gating:vertex>`;
const tr = (kind: string, param: string, attrs: Record<string, number>) =>
  `<transforms:${kind} ${Object.entries(attrs).map(([k, v]) => `transforms:${k}="${v}"`).join(" ")}><data-type:parameter data-type:name="${param}"/></transforms:${kind}>`;
const pop = (name: string, shape: string, children = "") => `<Population name="${name}" count="0"><Gate>${shape}</Gate>${children ? `<Subpopulations>${children}</Subpopulations>` : ""}</Population>`;

/** Asserts the kind and narrows the union for the checks that follow. */
function only<T extends { kind: string }, K extends T["kind"]>(v: T | undefined, kind: K): Extract<T, { kind: K }> {
  expect(v?.kind).toBe(kind);
  return v as Extract<T, { kind: K }>;
}

function workspace(opts: { name?: string; transforms?: string; matrix?: string; keywords?: Record<string, string>; tree: string; extraSamples?: string }): string {
  const kw = opts.keywords ?? { "$PAR": "2", "$P1N": "FSC-A", "$P1R": "1000", "$P2N": "FL1-A", "$P2R": "1000" };
  const kwStr = Object.entries(kw).map(([k, v]) => `<Keyword name="${k}" value="${v}"/>`).join("");
  const matrixStr = opts.matrix ?? "";
  const transformsStr = opts.transforms ?? "";
  const extraSamples = opts.extraSamples ?? "";
  return `<?xml version="1.0"?><Workspace version="20.0" ${NS}><SampleList><Sample><DataSet uri="file:/x" sampleID="1"/>${matrixStr}<Transformations>${transformsStr}</Transformations><Keywords>${kwStr}</Keywords><SampleNode name="${opts.name ?? "a.fcs"}" count="100" sampleID="1"><Subpopulations>${opts.tree}</Subpopulations></SampleNode></Sample>${extraSamples}</SampleList></Workspace>`;
}

test("xml: decodes entities and handles CDATA, unknown entities, and local name matching", () => {
  const xml = `<root attr="A&amp;B&lt;C&#65;&#x42;" xmlns:p="ns"><p:child><![CDATA[raw & < text]]></p:child><q:other>text</q:other>&#123;</root>`;
  const root = parseXml(xml);
  expect(root.name).toBe("root");
  expect(attr(root, "attr")).toBe("A&B<CAB");
  expect(parseXml("<r><n>&#123;</n><u>&foo;</u></r>").children.map((c) => c.text)).toEqual(["{", "&foo;"]);
  const childEl = childrenNamed(root, "child")[0];
  expect(childEl?.text).toBe("raw & < text");
  const other = childrenNamed(root, "other")[0];
  expect(other?.name).toBe("q:other");
  expect(localName(other!.name)).toBe("other");
});

test("xml: throws XmlError for mismatched closing tag, unclosed element, and text after root", () => {
  expect(() => parseXml("<a></b>")).toThrow(XmlError);
  expect(() => parseXml("<a>text")).toThrow(XmlError);
  expect(() => parseXml("<a/>extra")).toThrow(XmlError);
});

test("xml: writeXml output parses back to the same names, attributes and text, closes prefixed elements with full name, and escapes special chars", () => {
  const el = { name: "gating:Root", attrs: { "data-type:name": "A&B<C" }, children: [{ name: "gating:Child", attrs: {}, children: [], text: "x<y&z>" }], text: "" };
  const out = writeXml(el);
  expect(out).toContain("</gating:Root>");
  expect(out).toContain("data-type:name=\"A&amp;B&lt;C\"");
  const parsed = parseXml(out);
  expect(parsed.name).toBe("gating:Root");
  expect(attr(parsed, "name")).toBe("A&B<C");
  expect(child(parsed, "Child")?.text).toBe("x<y&z>");
});

test("wsp: 2D rectangle on linear transform gives correct gate and scales", () => {
  const xml = workspace({
    transforms: `${tr("linear", "FSC-A", { minRange: 0, maxRange: 1000 })}${tr("linear", "FL1-A", { minRange: 0, maxRange: 1000 })}`,
    tree: pop("p", `<gating:RectangleGate>${dim("FSC-A", 250, 750)}${dim("FL1-A", 500)}</gating:RectangleGate>`)
  });
  const res = readWsp(xml, ["a.fcs"]);
  expect(res.populations.length).toBe(1);
  const g = only(res.populations[0]?.gate, "rectangle");
  expect(g.xMin).toBeCloseTo(0.25, 5);
  expect(g.xMax).toBeCloseTo(0.75, 5);
  expect(g.yMin).toBeCloseTo(0.5, 5);
  expect(g.yMax).toBe(1e9);
  expect(res.populations[0]!.id).toBe("w1");
  expect(res.populations[0]!.parentId).toBeNull();
  expect(Object.keys(res.scales)).toContain("FSC-A");
  expect(Object.keys(res.scales)).toContain("FL1-A");
});

test("wsp: 1D rectangle gives range gate and nested child gets parentId", () => {
  const xml = workspace({
    transforms: tr("linear", "FSC-A", { minRange: 0, maxRange: 1000 }),
    tree: pop("p1", `<gating:RectangleGate>${dim("FSC-A", 10, 20)}</gating:RectangleGate>`, pop("p2", `<gating:RectangleGate>${dim("FSC-A", 30, 40)}</gating:RectangleGate>`))
  });
  const res = readWsp(xml, ["a.fcs"]);
  expect(res.populations.length).toBe(2);
  expect(res.populations[0]!.gate.kind).toBe("range");
  expect(res.populations[1]!.parentId).toBe("w1");
});

test("wsp: polygon on log axis converts vertices with log10(v)/decades", () => {
  const xml = workspace({
    transforms: `${tr("log", "FSC-A", { offset: 1, decades: 3 })}${tr("log", "FL1-A", { offset: 1, decades: 3 })}`,
    tree: pop("p", `<gating:PolygonGate>${dim("FSC-A")}${dim("FL1-A")}${vertex(10, 10)}${vertex(100, 10)}${vertex(10, 100)}</gating:PolygonGate>`)
  });
  const res = readWsp(xml, ["a.fcs"]);
  const g = only(res.populations[0]?.gate, "polygon");
  const p0 = g.points[0];
  expect(p0?.[0]).toBeCloseTo(Math.log10(10) / 3, 5);
  expect(p0?.[1]).toBeCloseTo(Math.log10(10) / 3, 5);
});

test("wsp: biex transform maps to logicle T W M A", () => {
  const xml = workspace({
    transforms: tr("biex", "FSC-A", { maxRange: 1000, width: -100, pos: 4, neg: 0 }),
    tree: pop("p", `<gating:RectangleGate>${dim("FSC-A", 1, 2)}</gating:RectangleGate>`)
  });
  const res = readWsp(xml, ["a.fcs"]);
  const s = only(res.scales["FSC-A"], "logicle");
  expect(s.T).toBe(1000);
  expect(s.W).toBeCloseTo(Math.log10(100) / 2, 5);
  expect(s.M).toBe(4);
  expect(s.A).toBe(0);
});

test("wsp: compensation matrix and compensated parameter", () => {
  const xml = workspace({
    keywords: { "$PAR": "3", "$P1N": "FSC-A", "$P1R": "1000", "$P2N": "FL1-A", "$P2R": "1000", "$P3N": "FL2-A", "$P3R": "1000" },
    matrix: `<transforms:spilloverMatrix prefix="Comp-" suffix=""><transforms:spillover data-type:parameter="FL1-A"><transforms:coefficient data-type:parameter="FL2-A" transforms:value="0.1"/></transforms:spillover><transforms:spillover data-type:parameter="FL2-A"><transforms:coefficient data-type:parameter="FL1-A" transforms:value="0.05"/></transforms:spillover></transforms:spilloverMatrix>`,
    transforms: `${tr("linear", "Comp-FL1-A", { minRange: 0, maxRange: 1000 })}${tr("linear", "Comp-FL2-A", { minRange: 0, maxRange: 1000 })}`,
    tree: pop("p", `<gating:RectangleGate>${dim("Comp-FL1-A", 1, 2)}</gating:RectangleGate>`)
  });
  const res = readWsp(xml, ["a.fcs"]);
  expect(res.compensated).toBe(true);
  const g = only(res.populations[0]?.gate, "range");
  expect(g.x.param).toBe("FL1-A");
  expect(res.spillover?.parameters).toEqual(["FL1-A", "FL2-A"]);
  expect(res.spillover?.matrix).toEqual([[1, 0.1], [0.05, 1]]);
});

test("wsp: boolean populations and removal of invalid nodes", () => {
  const xml = workspace({
    transforms: tr("linear", "FSC-A", { minRange: 0, maxRange: 1000 }),
    tree: `<OrNode name="A or B" count="0"><Dependents><Dependent name="A"/><Dependent name="B"/></Dependents></OrNode>${pop("A", `<gating:RectangleGate>${dim("FSC-A", 1, 2)}</gating:RectangleGate>`)}` +
      `${pop("B", `<gating:RectangleGate>${dim("FSC-A", 3, 4)}</gating:RectangleGate>`)}` +
      `<NotNode name="Bad"><Dependents><Dependent name="Missing"/></Dependents><Subpopulations>${pop("ChildOfBad", `<gating:RectangleGate>${dim("FSC-A", 5, 6)}</gating:RectangleGate>`)}</Subpopulations></NotNode>`
  });
  const res = readWsp(xml, ["a.fcs"]);
  const boolPop = res.populations.find(p => p.name === "A or B");
  expect(boolPop?.gate.kind).toBe("boolean");
  expect(boolPop?.gate.kind === "boolean" && boolPop.gate.op).toBe("or");
  const id = (name: string) => res.populations.find((p) => p.name === name)?.id;
  expect(boolPop?.gate.kind === "boolean" && boolPop.gate.of).toEqual([id("A")!, id("B")!]);
  expect(res.populations.find((p) => p.name === "Bad")).toBeUndefined();
  expect(res.report.some((r) => r.startsWith("Bad:"))).toBe(true);
  expect(res.populations.find(p => p.name === "ChildOfBad")).toBeUndefined();
});

test("wsp: gate with eventsInside=0 is skipped with child and reported", () => {
  const xml = workspace({
    transforms: tr("linear", "FSC-A", { minRange: 0, maxRange: 1000 }),
    tree: pop("Empty", `<gating:RectangleGate eventsInside="0">${dim("FSC-A", 1, 2)}</gating:RectangleGate>`, pop("Child", `<gating:RectangleGate>${dim("FSC-A", 3, 4)}</gating:RectangleGate>`))
  });
  const res = readWsp(xml, ["a.fcs"]);
  expect(res.populations.length).toBe(0);
  expect(res.report.some(r => r.startsWith("Empty"))).toBe(true);
});

test("wsp: EllipsoidGate on linear axes gives approximate ellipse parameters", () => {
  const xml = workspace({
    transforms: `${tr("linear", "FSC-A", { minRange: 0, maxRange: 1000 })}${tr("linear", "FL1-A", { minRange: 0, maxRange: 1000 })}`,
    tree: pop("p", `<gating:EllipsoidGate>${dim("FSC-A")}${dim("FL1-A")}<gating:foci>${vertex(96, 128)}${vertex(160, 128)}</gating:foci><gating:edge>${vertex(192, 128)}${vertex(64, 128)}${vertex(128, 160)}${vertex(128, 96)}</gating:edge></gating:EllipsoidGate>`)
  });
  const res = readWsp(xml, ["a.fcs"]);
  const g = only(res.populations[0]?.gate, "ellipse");
  expect(g.cx).toBeCloseTo(0.5, 5);
  expect(g.cy).toBeCloseTo(0.5, 5);
  expect(g.rx).toBeCloseTo(0.25, 5);
  expect(g.angle).toBeCloseTo(0, 5);
  const expectedRy = Math.sqrt(0.25 * 0.25 - 0.125 * 0.125);
  expect(g.ry).toBeCloseTo(expectedRy, 5);
  expect(res.report.some(r => r.includes("approximate"))).toBe(true);
});

test("wsp: linear Time transform with gain gives correct display values", () => {
  const xml = workspace({
    keywords: { "$PAR": "3", "$P1N": "FSC-A", "$P1R": "1000", "$P2N": "FL1-A", "$P2R": "1000", "$P3N": "Time", "$P3R": "1000" },
    transforms: `<transforms:linear transforms:minRange="0" transforms:maxRange="10" gain="0.01"><data-type:parameter data-type:name="Time"/></transforms:linear>`,
    tree: pop("p", `<gating:RectangleGate>${dim("Time", 1, 2)}</gating:RectangleGate>`)
  });
  const res = readWsp(xml, ["a.fcs"]);
  const g = only(res.populations[0]?.gate, "range");
  expect(g.min).toBeCloseTo(0.1, 5);
  expect(g.max).toBeCloseTo(0.2, 5);
});

test("wsp: readWsp prefers sample in openNames and reports source", () => {
  const xml = workspace({
    tree: pop("p", `<gating:RectangleGate>${dim("FSC-A", 1, 2)}</gating:RectangleGate>`),
    extraSamples: `<Sample><DataSet uri="file:/y" sampleID="2"/><Keywords><Keyword name="$PAR" value="2"/><Keyword name="$P1N" value="FSC-A"/><Keyword name="$P1R" value="1000"/><Keyword name="$P2N" value="FL1-A"/><Keyword name="$P2R" value="1000"/></Keywords><SampleNode name="b.fcs" count="100" sampleID="2"><Subpopulations>${pop("q", `<gating:RectangleGate>${dim("FSC-A", 3, 4)}</gating:RectangleGate>`)}</Subpopulations></SampleNode></Sample>`
  });
  const res = readWsp(xml, ["b.fcs"]);
  expect(res.source).toBe("b.fcs");
  expect(res.report.some(r => r.includes("b.fcs"))).toBe(true);
});

test("wsp: throws for non-Workspace root and empty samples", () => {
  expect(() => readWsp("<Root/>", [])).toThrow("not a .wsp workspace");
  expect(() => readWsp(`<?xml version="1.0"?><Workspace version="20.0" ${NS}><SampleList></SampleList></Workspace>`, [])).toThrow("lists no samples");
});
