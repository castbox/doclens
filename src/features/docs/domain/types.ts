import type { PreviewKind } from "./fileType";

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
