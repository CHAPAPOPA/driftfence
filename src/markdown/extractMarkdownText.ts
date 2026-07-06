import remarkParse from "remark-parse";
import { unified } from "unified";

export type MarkdownTextKind = "code" | "inlineCode";

export interface MarkdownTextReference {
  kind: MarkdownTextKind;
  value: string;
}

interface MarkdownNode {
  type?: string;
  value?: unknown;
  children?: MarkdownNode[];
}

export function extractMarkdownText(markdown: string): MarkdownTextReference[] {
  const tree = unified().use(remarkParse).parse(markdown) as MarkdownNode;
  const references: MarkdownTextReference[] = [];

  collectMarkdownText(tree, references);

  return references;
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
