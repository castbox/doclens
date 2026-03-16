import type { PreviewKind } from "./fileType";
import type { MarkdownHeading } from "./markdownHeading";

export type TreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  hasChildren?: boolean;
};

export type FilePreviewPayload = {
  path: string;
  name: string;
  kind: PreviewKind;
  size: number;
  modifiedAt: string;
  truncated: boolean;
  truncatedLines: number;
  content: string;
  markdown?: {
    renderedContent: string;
    headings: MarkdownHeading[];
  };
  star?: DocStarStatus;
};

export type PathMetaPayload =
  | {
      path: string;
      nodeType: "file";
      size: number;
      modifiedAt: string;
      kind: PreviewKind;
    }
  | {
      path: string;
      nodeType: "directory";
      modifiedAt: string;
    };

export type DocStarStatus = {
  path: string;
  name: string;
  isStarred: boolean;
  starredAt: string | null;
};

export type DocStarUpdate = {
  path: string;
  isStarred: boolean;
  starredAt: string | null;
};

export type StarredDocRecord = {
  path: string;
  name: string;
  starredAt: string;
};
