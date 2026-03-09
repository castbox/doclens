import { Buffer } from "node:buffer";
import HtmlToDocx from "@turbodocx/html-to-docx";
import rehypeSanitize, { type Options as MarkdownSanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import {
  buildDocExportFileName,
  buildDocExportHtml,
  buildDocExportModel,
  buildInfoContentHtml,
  buildPreformattedContentHtml,
  type DocExportFormat
} from "@/features/docs/domain/docExport";
import { isMermaidLanguage, normalizeCodeBlockSource } from "@/features/docs/domain/mermaid";
import { markdownSanitizeSchema } from "@/features/docs/domain/markdownSanitize";
import { autoLinkDocsMarkdownPaths, preserveDiffSectionLineBreaks } from "@/features/docs/domain/markdownPreviewTransform";
import type { FilePreviewPayload } from "@/features/docs/domain/types";
import { readFilePreview } from "@/features/docs/services/docsFsService";
import { renderMermaidPngDataUrl } from "@/features/docs/services/mermaidRenderService";

export type DocExportResult = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
};

const exportMarkdownSanitizeSchema: MarkdownSanitizeSchema = {
  ...markdownSanitizeSchema,
  protocols: {
    ...markdownSanitizeSchema.protocols,
    src: [...new Set([...(markdownSanitizeSchema.protocols?.src ?? []), "data"])]
  }
};

function getClassNameValue(className: unknown): string {
  if (Array.isArray(className)) {
    return className.join(" ");
  }

  return typeof className === "string" ? className : "";
}

function getNodeTextContent(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const currentNode = node as { type?: string; value?: unknown; children?: unknown[] };
  if (currentNode.type === "text") {
    return typeof currentNode.value === "string" ? currentNode.value : "";
  }

  if (!Array.isArray(currentNode.children)) {
    return "";
  }

  return currentNode.children.map((child) => getNodeTextContent(child)).join("");
}

function rehypeRenderMermaidImages() {
  return async (tree: unknown) => {
    const renderTasks: Promise<void>[] = [];

    visit(tree as any, "element", (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== "number" || node.tagName !== "pre") {
        return;
      }

      const codeNode = Array.isArray(node.children) ? node.children[0] : null;
      if (!codeNode || codeNode.type !== "element" || codeNode.tagName !== "code") {
        return;
      }

      const className = getClassNameValue(codeNode.properties?.className);
      if (!isMermaidLanguage(className)) {
        return;
      }

      const mermaidSource = normalizeCodeBlockSource(getNodeTextContent(codeNode));
      renderTasks.push(
        (async () => {
          try {
            const src = await renderMermaidPngDataUrl(mermaidSource);
            parent.children[index] = {
              type: "element",
              tagName: "section",
              properties: {
                className: ["mermaid-export-block"]
              },
              children: [
                {
                  type: "element",
                  tagName: "img",
                  properties: {
                    src,
                    alt: "Mermaid 图表"
                  },
                  children: []
                }
              ]
            };
          } catch (error) {
            console.warn("Mermaid export render failed:", error);
          }
        })()
      );
    });

    await Promise.all(renderTasks);
  };
}

async function renderMarkdownContentHtml(content: string): Promise<string> {
  if (!content.trim()) {
    return buildInfoContentHtml("文件内容为空。");
  }

  const processedMarkdown = autoLinkDocsMarkdownPaths(preserveDiffSectionLineBreaks(content));
  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeRenderMermaidImages)
    .use(rehypeSanitize, exportMarkdownSanitizeSchema)
    .use(rehypeStringify)
    .process(processedMarkdown);

  return `<section class="doc-content">${String(html)}</section>`;
}

function renderNonMarkdownContentHtml(payload: FilePreviewPayload): string {
  if (payload.kind === "code" || payload.kind === "text") {
    return buildPreformattedContentHtml(payload.content);
  }

  if (payload.kind === "pdf") {
    return buildInfoContentHtml("当前文件为 PDF。导出的 Word 文档会保留详情页元信息，但不会嵌入 PDF 页面内容。");
  }

  return buildInfoContentHtml("当前文件不支持文本预览。导出的 Word 文档会保留详情页元信息，正文部分仅记录该提示。");
}

async function buildExportHtml(payload: FilePreviewPayload): Promise<string> {
  const contentHtml = payload.kind === "markdown" ? await renderMarkdownContentHtml(payload.content) : renderNonMarkdownContentHtml(payload);
  return buildDocExportHtml(buildDocExportModel(payload, contentHtml));
}

async function toBuffer(value: ArrayBuffer | Blob | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  return Buffer.from(await value.arrayBuffer());
}

export async function exportDocFile(inputPath: string, format: DocExportFormat): Promise<DocExportResult> {
  const payload = await readFilePreview(inputPath, { fullContent: true });
  const fileName = buildDocExportFileName(payload.path, format);
  const html = await buildExportHtml(payload);

  if (format === "doc") {
    return {
      buffer: Buffer.from(`\uFEFF${html}`, "utf8"),
      contentType: "application/msword; charset=utf-8",
      fileName
    };
  }

  const docx = await HtmlToDocx(html, undefined, {
    title: payload.name,
    subject: `DocLens 文档详情页导出：docs/${payload.path}`,
    creator: "DocLens",
    lang: "zh-CN",
    table: {
      row: {
        cantSplit: true
      }
    }
  });

  return {
    buffer: await toBuffer(docx),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName
  };
}
