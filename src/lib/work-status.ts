import type { ReviewStatus } from "@/lib/types";

export const reviewStatusToDatabase = {
  needs_review: "inbox",
  open: "planned",
  completed: "completed",
  deferred: "deferred",
  not_applicable: "rejected",
} as const satisfies Record<ReviewStatus, string>;

export function databaseStatusToReview(status: string | null): ReviewStatus {
  if (status === "planned" || status === "scheduled" || status === "in_progress") return "open";
  if (status === "completed") return "completed";
  if (status === "deferred") return "deferred";
  if (status === "rejected" || status === "canceled") return "not_applicable";
  return "needs_review";
}

export function isClosedReviewStatus(status: ReviewStatus | undefined) {
  return status === "completed" || status === "not_applicable";
}
