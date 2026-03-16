export type ReviewStatus = "Draft" | "In Review" | "Changes Requested" | "Approved" | "Done";
export type ReviewConclusion = "Approved" | "Changes Requested" | "Reject" | "Need Discussion";
export type ReviewDocType = "PRD" | "Design" | "PR" | "Log" | "Other";
export type ReviewSeverity = "P0" | "P1" | "P2";
export type ReviewItemState = "Open" | "Resolved" | "Won't Fix";

export type ReviewSheet = {
  id: string;
  title: string;
  docPath: string;
  docType: ReviewDocType;
  status: ReviewStatus;
  conclusion: ReviewConclusion;
  summary: string;
  owner: string;
  reviewer: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewItem = {
  id: string;
  sheetId: string;
  severity: ReviewSeverity;
  description: string;
  suggestion: string;
  assignee: string;
  dueDate: string | null;
  state: ReviewItemState;
  createdAt: string;
  updatedAt: string;
};

export type ReviewSheetWithItems = ReviewSheet & {
  items: ReviewItem[];
};

export type CreateReviewSheetInput = {
  title: string;
  docPath: string;
  docType: ReviewDocType;
  conclusion: ReviewConclusion;
  summary: string;
  owner: string;
  reviewer: string;
  status?: ReviewStatus;
};

export type UpdateReviewSheetInput = Partial<Pick<CreateReviewSheetInput, "title" | "docType" | "conclusion" | "summary" | "owner" | "reviewer">> & {
  status?: ReviewStatus;
};

export type CreateReviewItemInput = {
  severity: ReviewSeverity;
  description: string;
  suggestion: string;
  assignee: string;
  dueDate?: string | null;
  state?: ReviewItemState;
};

export type UpdateReviewItemInput = Partial<CreateReviewItemInput>;

export type PrFileRecord = {
  path: string;
  name: string;
  dateFolder: string;
  category: string;
  createdAt: string;
  modifiedAt: string;
  isStarred: boolean;
  starredAt: string | null;
  isRead: boolean;
  readAt: string | null;
};

export type PrFileReadFilter = "all" | "read" | "unread";

export type PrFileStarUpdate = {
  path: string;
  isStarred: boolean;
  starredAt: string | null;
};
