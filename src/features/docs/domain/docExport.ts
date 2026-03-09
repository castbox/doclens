import path from "node:path";
import type { FilePreviewPayload } from "./types";
import { formatDateTime } from "@/shared/domain/time";

export type DocExportFormat = "doc" | "docx";

export type DocExportModel = {
  title: string;
  sourcePath: string;
  sourceKind: FilePreviewPayload["kind"];
  sourceSize: string;
  modifiedAt: string;
  exportedAt: string;
  contentHtml: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function sanitizeFileStem(fileStem: string): string {
  const normalized = fileStem.trim().replace(/[\\/:*?"<>|]/g, "-");
  return normalized || "doclens-detail";
}

export function buildDocExportFileName(docPath: string, format: DocExportFormat): string {
  const sourceName = path.posix.basename(docPath);
  const extension = path.posix.extname(sourceName);
  const baseName = extension ? sourceName.slice(0, -extension.length) : sourceName;
  return `${sanitizeFileStem(baseName)}-详情页.${format}`;
}

export function buildDocExportModel(payload: FilePreviewPayload, contentHtml: string, exportedAt = new Date()): DocExportModel {
  return {
    title: payload.name,
    sourcePath: `docs/${payload.path}`,
    sourceKind: payload.kind,
    sourceSize: formatBytes(payload.size),
    modifiedAt: formatDateTime(payload.modifiedAt),
    exportedAt: formatDateTime(exportedAt),
    contentHtml
  };
}

export function buildPreformattedContentHtml(content: string): string {
  const normalizedContent = content.trim().length > 0 ? escapeHtml(content) : "文件内容为空。";

  return `
    <section class="doc-content">
      <pre>${normalizedContent}</pre>
    </section>
  `;
}

export function buildInfoContentHtml(message: string): string {
  return `
    <section class="doc-content">
      <p>${escapeHtml(message)}</p>
    </section>
  `;
}

export function buildDocExportHtml(model: DocExportModel): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(model.title)} - DocLens 导出</title>
    <style>
      body {
        font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #1f2937;
        font-size: 12pt;
        line-height: 1.7;
        margin: 0;
      }

      h1, h2, h3, h4, h5, h6 {
        color: #102a43;
        margin: 0 0 10pt;
        line-height: 1.35;
      }

      p, li, blockquote, td, th {
        font-size: 12pt;
      }

      a {
        color: #0b7285;
        text-decoration: underline;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 12pt 0;
      }

      th, td {
        border: 1px solid #d7e4ee;
        padding: 6pt 8pt;
        vertical-align: top;
      }

      th {
        background: #f5f9fd;
        text-align: left;
      }

      blockquote {
        border-left: 4px solid #a8c7e6;
        margin: 12pt 0;
        padding: 2pt 0 2pt 12pt;
        color: #486581;
      }

      code, pre {
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
      }

      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #f8fafc;
        border: 1px solid #d7e4ee;
        border-radius: 8px;
        padding: 12pt;
        margin: 0;
      }

      .page-header {
        margin-bottom: 18pt;
      }

      .page-title {
        margin-bottom: 6pt;
      }

      .page-subtitle {
        color: #52606d;
        font-size: 10.5pt;
      }

      .meta-table {
        margin-bottom: 18pt;
      }

      .meta-table th {
        width: 108pt;
      }

      .doc-content p:first-child,
      .doc-content pre:first-child {
        margin-top: 0;
      }

      .doc-content p:last-child,
      .doc-content pre:last-child {
        margin-bottom: 0;
      }
    </style>
  </head>
  <body>
    <section class="page-header">
      <h1 class="page-title">${escapeHtml(model.title)}</h1>
      <div class="page-subtitle">DocLens 文档详情页导出</div>
    </section>

    <table class="meta-table">
      <tbody>
        <tr>
          <th>文档路径</th>
          <td>${escapeHtml(model.sourcePath)}</td>
        </tr>
        <tr>
          <th>文件类型</th>
          <td>${escapeHtml(model.sourceKind.toUpperCase())}</td>
        </tr>
        <tr>
          <th>文件大小</th>
          <td>${escapeHtml(model.sourceSize)}</td>
        </tr>
        <tr>
          <th>最后修改</th>
          <td>${escapeHtml(model.modifiedAt)}</td>
        </tr>
        <tr>
          <th>导出时间</th>
          <td>${escapeHtml(model.exportedAt)}</td>
        </tr>
      </tbody>
    </table>

    ${model.contentHtml}
  </body>
</html>`;
}
