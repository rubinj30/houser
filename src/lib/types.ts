export type Severity = "maintenance_item" | "recommendation" | "safety_hazard";
export type Priority = "urgent" | "important" | "routine" | "informational";

export type Finding = {
  workItemId?: string;
  reportId: string;
  title: string;
  category: string;
  area: string;
  assetKey?: string;
  workType: string;
  severity: Severity;
  priority: Priority;
  location: string;
  suggestedAction: string;
  sourcePages: number[];
};

export type Asset = {
  key: string;
  name: string;
  category: string;
  area: string;
  assetType: string;
  manufacturedYear?: number | null;
  installedYear?: number;
  sourcePages: number[];
  [key: string]: unknown;
};

export type InspectionSeed = {
  schemaVersion: number;
  property: {
    displayName: string;
    kind: string;
    address: { line1: string; city: string; region: string; postalCode: string };
    timezone: string;
  };
  source: {
    type: string;
    documentDate: string;
    originalFilename: string;
    pageCount: number;
    generateFindingCaptures: boolean;
  };
  importPolicy: {
    defaultStatus: string;
    needsVerification: boolean;
    manualReviewRequired: boolean;
  };
  areas: string[];
  assets: Asset[];
  findings: Finding[];
};

export type LocalWorkItem = Finding & { isLocal?: boolean };

export type ReviewStatus = "needs_review" | "open" | "completed" | "deferred" | "not_applicable";

export type ReviewActivity = {
  id: string;
  reportId: string;
  status: ReviewStatus;
  note: string;
  createdAt: string;
};

export type HouserWorkspace = {
  accountId: string;
  propertyId: string;
  userEmail: string;
  seed: InspectionSeed;
  findings: Finding[];
  reviewStatuses: Record<string, ReviewStatus>;
  reviewActivities: ReviewActivity[];
};
