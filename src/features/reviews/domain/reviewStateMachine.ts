import type { ReviewStatus } from "./types";

const ALLOWED_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  Draft: ["In Review"],
  "In Review": ["Changes Requested", "Approved"],
  "Changes Requested": ["In Review"],
  Approved: ["Done"],
  Done: []
};

export function canTransitionReviewStatus(from: ReviewStatus, to: ReviewStatus): boolean {
  if (from === to) {
    return true;
  }

  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertReviewStatusTransition(from: ReviewStatus, to: ReviewStatus): void {
  if (!canTransitionReviewStatus(from, to)) {
    throw new Error(`Invalid status transition: ${from} -> ${to}`);
  }
}
