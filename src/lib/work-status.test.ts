import { describe, expect, it } from "vitest";
import { databaseStatusToReview, reviewStatusToDatabase } from "./work-status";

describe("work status mapping", () => {
  it("maps every owner review state to a database state", () => {
    expect(reviewStatusToDatabase).toEqual({
      needs_review: "inbox",
      open: "planned",
      completed: "completed",
      deferred: "deferred",
      not_applicable: "rejected",
    });
  });

  it("collapses scheduling states into visible owner review states", () => {
    expect(databaseStatusToReview("scheduled")).toBe("open");
    expect(databaseStatusToReview("in_progress")).toBe("open");
    expect(databaseStatusToReview("canceled")).toBe("not_applicable");
    expect(databaseStatusToReview("inbox")).toBe("needs_review");
  });
});
