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

interface MarkdownNode {
  type?: string;
  value?: unknown;
  children?: MarkdownNode[];
}

const ignoreStart = "<!-- driftfence-ignore-start -->";
const ignoreEnd = "<!-- driftfence-ignore-end -->";

export function extractMarkdownText(markdown: string): MarkdownTextReference[] {
  const tree = unified()
    .use(remarkParse)
    .parse(stripIgnoredMarkdownBlocks(markdown)) as MarkdownNode;
  const references: MarkdownTextReference[] = [];

  collectMarkdownText(tree, references);

  return references;
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

function collectMarkdownText(
  node: MarkdownNode,
  references: MarkdownTextReference[],
): void {
  if (
    (node.type === "code" || node.type === "inlineCode") &&
    typeof node.value === "string"
  ) {
    references.push({ kind: node.type, value: node.value });
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    collectMarkdownText(child, references);
  }
}
