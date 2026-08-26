export type Severity = "maintenance_item" | "recommendation" | "safety_hazard";
export type Priority = "urgent" | "important" | "routine" | "informational";

export type Finding = {
  workItemId?: string;
  propertyId?: string;
  propertyName?: string;
  reportId: string;
  sourceReference?: string;
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
  sourceDocumentId?: string;
  sourceExcerpt?: string;
  targetStartOn?: string | null;
  targetEndOn?: string | null;
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
  actorName?: string | null;
  actorEmail?: string | null;
};

export type PropertySummary = {
  id: string;
  displayName: string;
  propertyType: string;
  address: string;
  timezone: string;
};

export type InspectionEvidencePage = {
  pageNumber: number;
  previewUrl: string | null;
  reportUrl: string;
};

export type InspectionEvidence = {
  documentName: string;
  pages: InspectionEvidencePage[];
  expiresAt: string;
};

export type LinkedWorkDocument = {
  id: string;
  documentType: string;
  filename: string;
  documentDate: string | null;
  relationship: "source" | "supporting";
};

export type ServiceRecord = {
  id: string;
  reportId: string;
  performedOn: string;
  description: string;
  vendorName: string | null;
  costMinor: number | null;
  currency: string;
  warrantyEndsOn: string | null;
  recurrenceMonths: number | null;
  nextServiceOn: string | null;
};

export type WorkCompletionInput = {
  workItemId: string;
  reportId: string;
  performedOn: string;
  vendorName: string;
  cost: string;
  note: string;
  warrantyEndsOn: string;
  recurrenceMonths: number | null;
};

export type WorkCompletionResult = {
  status: ReviewStatus;
  activity: ReviewActivity;
  serviceRecord: ServiceRecord;
  nextServiceOn: string | null;
};

export type HouserWorkspace = {
  accountId: string;
  propertyId: string | null;
  selectedPropertyId: string | "all";
  properties: PropertySummary[];
  userEmail: string;
  hasInspectionDocument: boolean;
  seed: InspectionSeed;
  findings: Finding[];
  reviewStatuses: Record<string, ReviewStatus>;
  reviewActivities: ReviewActivity[];
  serviceRecords: ServiceRecord[];
};
