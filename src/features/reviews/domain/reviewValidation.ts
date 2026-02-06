import type {
  CreateReviewItemInput,
  CreateReviewSheetInput,
  ReviewConclusion,
  ReviewDocType,
  ReviewItemState,
  ReviewSeverity,
  ReviewStatus,
  UpdateReviewItemInput,
  UpdateReviewSheetInput
} from "./types";

const REVIEW_STATUSES: ReviewStatus[] = ["Draft", "In Review", "Changes Requested", "Approved", "Done"];
const REVIEW_CONCLUSIONS: ReviewConclusion[] = ["Approved", "Changes Requested", "Reject", "Need Discussion"];
const REVIEW_DOC_TYPES: ReviewDocType[] = ["PRD", "Design", "PR", "Log", "Other"];
const REVIEW_SEVERITIES: ReviewSeverity[] = ["P0", "P1", "P2"];
const REVIEW_ITEM_STATES: ReviewItemState[] = ["Open", "Resolved", "Won't Fix"];

function ensureString(value: unknown, fieldName: string, required = true): string {
  if (value === undefined || value === null) {
    if (!required) {
      return "";
    }
    throw new Error(`${fieldName} is required`);
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed && required) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmed;
}

function ensureEnum<T extends string>(value: unknown, fieldName: string, values: T[], required = true): T | undefined {
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return undefined;
  }

  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${fieldName} is invalid`);
  }

  return value as T;
}

export function validateCreateReviewSheet(payload: unknown): CreateReviewSheetInput {
  const data = payload as Record<string, unknown>;

  return {
    title: ensureString(data.title, "title"),
    docPath: ensureString(data.docPath, "docPath"),
    docType: ensureEnum(data.docType, "docType", REVIEW_DOC_TYPES) as ReviewDocType,
    conclusion: ensureEnum(data.conclusion, "conclusion", REVIEW_CONCLUSIONS) as ReviewConclusion,
    summary: ensureString(data.summary, "summary"),
    owner: ensureString(data.owner, "owner"),
    reviewer: ensureString(data.reviewer, "reviewer"),
    status: (ensureEnum(data.status, "status", REVIEW_STATUSES, false) ?? "Draft") as ReviewStatus
  };
}

export function validateUpdateReviewSheet(payload: unknown): UpdateReviewSheetInput {
  const data = payload as Record<string, unknown>;
  const result: UpdateReviewSheetInput = {};

  if (data.title !== undefined) {
    result.title = ensureString(data.title, "title");
  }

  if (data.docType !== undefined) {
    result.docType = ensureEnum(data.docType, "docType", REVIEW_DOC_TYPES) as ReviewDocType;
  }

  if (data.conclusion !== undefined) {
    result.conclusion = ensureEnum(data.conclusion, "conclusion", REVIEW_CONCLUSIONS) as ReviewConclusion;
  }

  if (data.summary !== undefined) {
    result.summary = ensureString(data.summary, "summary");
  }

  if (data.owner !== undefined) {
    result.owner = ensureString(data.owner, "owner");
  }

  if (data.reviewer !== undefined) {
    result.reviewer = ensureString(data.reviewer, "reviewer");
  }

  if (data.status !== undefined) {
    result.status = ensureEnum(data.status, "status", REVIEW_STATUSES) as ReviewStatus;
  }

  return result;
}

export function validateCreateReviewItem(payload: unknown): CreateReviewItemInput {
  const data = payload as Record<string, unknown>;

  return {
    severity: ensureEnum(data.severity, "severity", REVIEW_SEVERITIES) as ReviewSeverity,
    description: ensureString(data.description, "description"),
    suggestion: ensureString(data.suggestion, "suggestion"),
    assignee: ensureString(data.assignee, "assignee"),
    dueDate: data.dueDate ? ensureString(data.dueDate, "dueDate", false) : null,
    state: (ensureEnum(data.state, "state", REVIEW_ITEM_STATES, false) ?? "Open") as ReviewItemState
  };
}

export function validateUpdateReviewItem(payload: unknown): UpdateReviewItemInput {
  const data = payload as Record<string, unknown>;
  const result: UpdateReviewItemInput = {};

  if (data.severity !== undefined) {
    result.severity = ensureEnum(data.severity, "severity", REVIEW_SEVERITIES) as ReviewSeverity;
  }

  if (data.description !== undefined) {
    result.description = ensureString(data.description, "description");
  }

  if (data.suggestion !== undefined) {
    result.suggestion = ensureString(data.suggestion, "suggestion");
  }

  if (data.assignee !== undefined) {
    result.assignee = ensureString(data.assignee, "assignee");
  }

  if (data.dueDate !== undefined) {
    result.dueDate = data.dueDate ? ensureString(data.dueDate, "dueDate", false) : null;
  }

  if (data.state !== undefined) {
    result.state = ensureEnum(data.state, "state", REVIEW_ITEM_STATES) as ReviewItemState;
  }

  return result;
}
