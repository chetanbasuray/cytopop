declare const __VERSION__: string;
/** Release this build came from: the git tag, plus commits since it when built off a tag. */
export const VERSION = typeof __VERSION__ === "string" ? __VERSION__.replace(/-(\d+)-g[0-9a-f]+$/, "+$1") : "dev";
