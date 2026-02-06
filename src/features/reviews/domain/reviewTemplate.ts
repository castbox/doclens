import type { CreateReviewSheetInput, ReviewDocType } from "./types";

function inferDocType(docPath: string): ReviewDocType {
  const lower = docPath.toLowerCase();
  if (lower.includes("prd")) return "PRD";
  if (lower.includes("design")) return "Design";
  if (lower.includes("pr")) return "PR";
  if (lower.includes("log")) return "Log";
  return "Other";
}

function inferTitle(docPath: string): string {
  const fileName = docPath.split("/").pop() ?? docPath;
  return `审阅单 - ${fileName}`;
}

export function buildDefaultReviewSheet(docPath: string): CreateReviewSheetInput {
  return {
    title: inferTitle(docPath),
    docPath,
    docType: inferDocType(docPath),
    conclusion: "Need Discussion",
    summary: "请填写一句话审阅结论",
    owner: "",
    reviewer: "",
    status: "Draft"
  };
}
