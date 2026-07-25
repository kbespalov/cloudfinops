/**
 * Structured objects for the agent solution pipeline:
 * RequirementSpec → candidates → Solution (estimated) → Validation → PricedSolution → Comparison.
 *
 * Authority: only price_solution returns authoritative totals.
 * compose_solution may expose estimatedMonthlyCostRub for ranking only.
 */

export type SolutionType =
  | 'virtual_machine'
  | 'kubernetes'
  | 'inference'
  | 'lakehouse'
  | 'web_application'
  | 'custom';

export type ComposeStrategy = 'cheapest' | 'balanced' | 'performance' | 'availability';

export type SolutionComponentRole =
  | 'compute'
  | 'gpu_compute'
  | 'k8s_master'
  | 'k8s_worker'
  | 'block_storage'
  | 'object_storage'
  | 'public_ip'
  | 'load_balancer'
  | 'cdn_egress'
  | 'internet_egress'
  | 'support'
  | 'other';

export type BillingScope =
  | 'whole_instance'
  | 'cpu'
  | 'ram'
  | 'gpu'
  | 'disk'
  | 'traffic'
  | 'service_fee'
  | 'unknown';

export type SelectionMethod =
  | 'pinned_meter'
  | 'exact_structural_match'
  | 'nearest_match'
  | 'synthetic'
  | 'fallback';

export type CatalogEntityType =
  | 'sku'
  | 'service'
  | 'product'
  | 'instance_type'
  | 'gpu_node'
  | 'storage'
  | 'managed_service';

export type FilterOperator = 'eq' | 'in' | 'gte' | 'lte' | 'contains' | 'exists';

export type CatalogFilter = {
  field: string;
  operator: FilterOperator;
  value: unknown;
};

export type Assumption = {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
  impact: 'low' | 'medium' | 'high';
};

export type UnresolvedRequirement = {
  code: string;
  message: string;
  role?: SolutionComponentRole;
  severity: 'warning' | 'blocking';
};

export type RequirementConstraints = {
  budgetMonthlyRub?: number;
  providers?: string[];
  excludedProviders?: string[];
  region?: string;
  availabilityZones?: number;
  minVcpu?: number;
  minRamGiB?: number;
  gpu?: {model?: string; minCount?: number; minVramGiB?: number};
  storage?: {
    minGiB?: number;
    media?: 'hdd' | 'ssd' | 'nvme';
    /** Soft preference when media is ambiguous (e.g. «быстрый диск»). */
    mediaPreference?: Array<'hdd' | 'ssd' | 'nvme'>;
    class?: string;
  };
  k8sTier?: 'basic' | 'ha';
};

export type RequirementQuantities = {
  workerCount?: number;
  /** True only when the user/LLM explicitly set workerCount (not a preview default). */
  workerCountExplicit?: boolean;
  instanceCount?: number;
  storageGiB?: number;
  /** Attached block volume (GiB), distinct from small system/worker boot disk. */
  blockStorageGiB?: number;
  egressGiB?: number;
  cdnEgressGiB?: number;
  /** CDN requested but volume may be unknown. */
  cdnRequested?: boolean;
  publicIpCount?: number;
  diskGiB?: number;
  workerVcpu?: number;
  workerRamGiB?: number;
  workerDiskGiB?: number;
};

/** Stable envelope — recipes must not invent ad-hoc keys. */
export type RequirementSpec = {
  id: string;
  solutionType: SolutionType;
  strategy: ComposeStrategy;
  period: {hoursPerMonth: 720; months?: number};
  currency: 'RUB';
  vatMode: 'included';
  constraints: RequirementConstraints;
  requiredRoles: SolutionComponentRole[];
  optionalRoles: SolutionComponentRole[];
  quantities: RequirementQuantities;
  rawText?: string;
  /** Free-form extras for specialized recipes (inference model name, lakehouse size…). */
  extras?: Record<string, unknown>;
};

export type MatchInfo = {
  score: number;
  lexicalScore?: number;
  structuralScore?: number;
  exactFields: string[];
  matchedFields: string[];
  unmatchedFields: string[];
  conflictingFields: string[];
  hardConstraintViolations: string[];
  warnings: string[];
};

export type CatalogCandidate = {
  id: string;
  meterId: string;
  provider: string;
  providerName: string;
  entityType: CatalogEntityType;
  title: string;
  sku: string;
  category: string;
  meterKind?: string | null;
  attributes: Record<string, unknown>;
  pricing: {
    amount: number | null;
    currency: 'RUB';
    period: 'hour' | 'month' | 'year';
    vatIncluded: true;
    hour: number | null;
    month: number | null;
  };
  match: MatchInfo;
  source: {
    url: string | null;
    priceUpdatedAt: string;
    catalogAsOf?: string;
  };
};

export type SolutionComponent = {
  id: string;
  role: SolutionComponentRole;
  meterId?: string;
  sku?: string;
  productId?: string | null;
  provider: string;
  title: string;
  quantity: number;
  unit?: string;
  /** Preliminary only — do not treat as authoritative. */
  estimatedMonthlyCostRub?: number | null;
  selection: {
    method: SelectionMethod;
    candidateScore?: number;
    alternatives?: string[];
  };
  scope: {billingScope: BillingScope};
  synthetic?: boolean;
  configuration?: Record<string, unknown>;
};

export type CoverageCounters = {
  requiredSatisfied: number;
  requiredTotal: number;
  optionalSatisfied: number;
  optionalTotal: number;
  score: number;
};

export type Solution = {
  id: string;
  requirementSpecId: string;
  provider: string;
  providerName: string;
  solutionType: SolutionType;
  strategy: ComposeStrategy;
  components: SolutionComponent[];
  assumptions: Assumption[];
  unresolved: UnresolvedRequirement[];
  tradeoffs: string[];
  coverage: CoverageCounters;
  /** Ranking estimate only — use price_solution for authoritative totals. */
  estimatedMonthlyCostRub: number | null;
  provenance: {
    recipeVersion: string;
    catalogAsOf?: string;
    generatedAt: string;
  };
  /** @deprecated use coverage.score — kept for prompt/fast-path compatibility */
  requirementsCoverage?: number;
  /** @deprecated use estimatedMonthlyCostRub */
  monthlyCostRub?: number | null;
  status?: 'valid' | 'partial' | 'invalid';
  priceCompleteness?: number;
};

export type ValidationCheckCategory =
  | 'requirements'
  | 'compatibility'
  | 'pricing'
  | 'provenance';

export type ValidationIssue = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  category: ValidationCheckCategory;
  componentId?: string;
  requirementPath?: string;
  message: string;
  required?: unknown;
  actual?: unknown;
  repair?: RepairSuggestion;
};

export type RepairSuggestion =
  | {
      action: 'add_component';
      role: SolutionComponentRole;
      constraints?: Record<string, unknown>;
      reasonCode: string;
      message?: string;
    }
  | {
      action: 'replace_component';
      componentId: string;
      constraints: Record<string, unknown>;
      reasonCode: string;
      message?: string;
    }
  | {
      action: 'raise_quantity';
      componentId: string;
      minimumQuantity: number;
      reasonCode: string;
      message?: string;
    }
  | {
      action: 'remove_component';
      componentId: string;
      reasonCode: string;
      message?: string;
    };

export type ValidationReport = {
  solutionId: string;
  status: 'valid' | 'valid_with_warnings' | 'invalid' | 'needs_clarification';
  /** Convenience: status is valid or valid_with_warnings (not invalid / needs_clarification). */
  valid: boolean;
  coverage: number;
  issues: ValidationIssue[];
  hardFailureCount: number;
  warningCount: number;
  checks: {
    requirementsSatisfied: boolean;
    scopeConsistent: boolean;
    priceComplete: boolean;
    provenanceComplete: boolean;
  };
  /** Flattened for LLM convenience */
  repairSuggestions: RepairSuggestion[];
};

export type PricingResolutionMode = 'strict_pinned' | 'allow_shape_resolution';

export type PricedLine = {
  componentId: string;
  meterId?: string;
  quantity: number;
  normalizedUnitPriceRub: number | null;
  normalizedMonthlyCostRub: number | null;
  pricingBasis: {
    originalUnit: string;
    originalPrice: number | null;
    hoursPerMonth?: number;
    usageQuantity?: number;
  };
  resolution: 'pinned' | 'shape_resolved' | 'synthetic' | 'unpriced';
};

export type PricedSolution = {
  solutionId: string;
  provider: string;
  providerName: string;
  lines: PricedLine[];
  totals: {
    monthlyRubVatIncluded: number | null;
    annualRubVatIncluded: number | null;
  };
  completeness: {
    pricedRequiredComponents: number;
    totalRequiredComponents: number;
    score: number;
  };
  catalogAsOf?: string;
  unresolvedMeterIds?: string[];
};

export type ComparisonRow = {
  solutionId: string;
  provider: string;
  providerName: string;
  monthlyCostRub: number | null;
  requirementCoverage: number;
  priceCompleteness: number;
  validationStatus: ValidationReport['status'] | 'unknown';
  unresolvedCount: number;
  dominatedBySolutionIds: string[];
  eligible: boolean;
};

export type ComparisonMatrix = {
  comparison: ComparisonRow[];
  paretoOptimalSolutionIds: string[];
  recommendedSolutionId?: string;
  recommendationReason?: string;
  dimensions: string[];
};

export type ComposeInput = {
  solutionType?: SolutionType;
  /** Prefer structured RequirementSpec; flat bag still accepted and normalized. */
  requirements?: RequirementSpec | Record<string, unknown>;
  providers?: string[];
  strategy?: ComposeStrategy;
  maxSolutions?: number;
  allowCrossProvider?: boolean;
  budgetMonthRub?: number;
  repairs?: RepairSuggestion[];
  previousSolution?: Solution;
};

export type SearchCatalogInput = {
  text?: string;
  entityTypes?: CatalogEntityType[];
  filters?: CatalogFilter[];
  providers?: string[];
  region?: string;
  regions?: string[];
  limit?: number;
  ranking?: {
    preferExactStructuralMatch?: boolean;
    preferFreshPrices?: boolean;
    priceDirection?: 'asc' | 'desc';
  };
  category?: string;
  gpuModel?: string;
  aiModel?: string;
  storageClass?: string;
  meterKind?: 'capacity' | 'requests';
  volumeGiB?: number;
};

export type NormalizationRule = {
  field: string;
  from: string;
  to: string;
  ruleId: string;
};

export type NormalizationResult<T> = {
  original: T;
  normalized: T;
  appliedRules: NormalizationRule[];
};
