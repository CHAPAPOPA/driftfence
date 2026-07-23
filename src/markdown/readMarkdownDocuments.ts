import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  extractMarkdownReferences,
  type MarkdownLinkReferenceWithPath,
  type MarkdownTextReferenceWithPath,
} from "./extractMarkdownText.js";
import {
  findMarkdownDocumentPaths,
  type MarkdownDocumentDiscoveryOptions,
} from "./documentGlobs.js";

export interface MarkdownDocument {
  path: string;
  content: string;
  references: MarkdownTextReferenceWithPath[];
  linkReferences?: MarkdownLinkReferenceWithPath[];
}

export async function readMarkdownDocuments(
  projectRoot: string,
  options: MarkdownDocumentDiscoveryOptions = {},
): Promise<MarkdownDocument[]> {
  const paths = await findMarkdownDocumentPaths(projectRoot, options);
  const documents: MarkdownDocument[] = [];

  for (const path of paths) {
    const content = await readFile(join(projectRoot, path), "utf8");
    const references = extractMarkdownReferences(content);

    documents.push({
      path,
      content,
      references: references.text.map((reference) => ({
        ...reference,
        path,
      })),
      linkReferences: references.links.map((reference) => ({
        ...reference,
        path,
      })),
    });
  }

  return documents;
}
