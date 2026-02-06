import { describe, expect, it } from "vitest";
import { assertReviewStatusTransition, canTransitionReviewStatus } from "./reviewStateMachine";

describe("reviewStateMachine", () => {
  it("允许合法流转", () => {
    expect(canTransitionReviewStatus("Draft", "In Review")).toBe(true);
    expect(canTransitionReviewStatus("Changes Requested", "In Review")).toBe(true);
    expect(canTransitionReviewStatus("Approved", "Done")).toBe(true);
  });

  it("拒绝非法流转", () => {
    expect(canTransitionReviewStatus("Draft", "Done")).toBe(false);
    expect(() => assertReviewStatusTransition("Draft", "Done")).toThrowError(/Invalid status transition/);
  });
});
