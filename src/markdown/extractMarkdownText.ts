import remarkParse from "remark-parse";
import { unified } from "unified";

export type MarkdownTextKind = "code" | "inlineCode";

export interface MarkdownTextReference {
  kind: MarkdownTextKind;
  value: string;
}

export interface MarkdownTextReferenceWithPath extends MarkdownTextReference {
  path: string;
}

export interface MarkdownLinkReference {
  destination: string;
}

export interface MarkdownLinkReferenceWithPath extends MarkdownLinkReference {
  path: string;
}

export interface MarkdownReferences {
  text: MarkdownTextReference[];
  links: MarkdownLinkReference[];
}

interface MarkdownNode {
  type?: string;
  value?: unknown;
  url?: unknown;
  identifier?: unknown;
  children?: MarkdownNode[];
}

const ignoreStart = "<!-- driftfence-ignore-start -->";
const ignoreEnd = "<!-- driftfence-ignore-end -->";

export function extractMarkdownText(markdown: string): MarkdownTextReference[] {
  return extractMarkdownReferences(markdown).text;
}

export function extractMarkdownReferences(
  markdown: string,
): MarkdownReferences {
  const tree = unified()
    .use(remarkParse)
    .parse(stripIgnoredMarkdownBlocks(markdown)) as MarkdownNode;
  const text: MarkdownTextReference[] = [];
  const links: MarkdownLinkReference[] = [];
  const definitions = new Map<string, string>();

  collectMarkdownDefinitions(tree, definitions);
  collectMarkdownReferences(tree, definitions, text, links);

  return { text, links };
}

export function stripIgnoredMarkdownBlocks(markdown: string): string {
  let strippedMarkdown = "";
  let position = 0;

  while (position < markdown.length) {
    const startIndex = markdown.indexOf(ignoreStart, position);

    if (startIndex === -1) {
      strippedMarkdown += markdown.slice(position);
      break;
    }

    strippedMarkdown += markdown.slice(position, startIndex);

    const endIndex = markdown.indexOf(
      ignoreEnd,
      startIndex + ignoreStart.length,
    );

    if (endIndex === -1) {
      break;
    }

    position = endIndex + ignoreEnd.length;
  }

  return strippedMarkdown;
}

function collectMarkdownDefinitions(
  node: MarkdownNode,
  definitions: Map<string, string>,
): void {
  if (
    node.type === "definition" &&
    typeof node.identifier === "string" &&
    typeof node.url === "string" &&
    !definitions.has(node.identifier)
  ) {
    definitions.set(node.identifier, node.url);
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    collectMarkdownDefinitions(child, definitions);
  }
}

function collectMarkdownReferences(
  node: MarkdownNode,
  definitions: Map<string, string>,
  text: MarkdownTextReference[],
  links: MarkdownLinkReference[],
): void {
  if (
    (node.type === "code" || node.type === "inlineCode") &&
    typeof node.value === "string"
  ) {
    text.push({ kind: node.type, value: node.value });
  }

  if (
    (node.type === "link" || node.type === "image") &&
    typeof node.url === "string"
  ) {
    links.push({ destination: node.url });
  }

  if (
    (node.type === "linkReference" || node.type === "imageReference") &&
    typeof node.identifier === "string"
  ) {
    const destination = definitions.get(node.identifier);

    if (destination !== undefined) {
      links.push({ destination });
    }
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    collectMarkdownReferences(child, definitions, text, links);
  }
}
