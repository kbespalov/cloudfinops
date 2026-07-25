/**
 * Structured objects for the agent solution pipeline:
 * RequirementSpec → CatalogCandidate → Solution → ValidationReport → Comparison.
 */

export type SolutionType =
  | 'virtual_machine'
  | 'kubernetes'
  | 'inference'
  | 'lakehouse'
  | 'web_application'
  | 'custom';

export type ComposeStrategy = 'cheapest' | 'balanced' | 'performance' | 'availability';

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

export type RequirementSpec = {
  workload?: string;
  vcpu?: number;
  vcpuMin?: number;
  ramGiB?: number;
  ramGiBMin?: number;
  diskGiB?: number;
  diskMedia?: 'ssd' | 'nvme' | 'hdd' | 'any';
  gpuModel?: string;
  gpuCount?: number;
  workerCount?: number;
  workerVcpu?: number;
  workerRamGiB?: number;
  workerDiskGiB?: number;
  k8sTier?: 'basic' | 'ha';
  managed?: boolean;
  storageClass?: 'standard' | 'warm' | 'cold' | 'ice';
  objectStorageGiB?: number;
  cdnEgressGiB?: number;
  egressGiB?: number;
  publicIpCount?: number;
  region?: string;
  providers?: string[];
  budgetMonthRub?: number;
  servicesCount?: number;
  availability?: string;
  [key: string]: unknown;
};

export type MatchInfo = {
  score: number;
  matchedFields: string[];
  unmatchedFields: string[];
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
  };
};

export type SolutionComponent = {
  role: string;
  productId: string | null;
  meterId: string | null;
  title: string;
  quantity: number;
  unit?: string;
  monthlyCostRub: number | null;
  synthetic?: boolean;
  scope?: string;
  configuration?: Record<string, unknown>;
};

export type SolutionStatus = 'valid' | 'partial' | 'invalid';

export type Solution = {
  id: string;
  provider: string;
  providerName: string;
  solutionType: SolutionType;
  status: SolutionStatus;
  components: SolutionComponent[];
  monthlyCostRub: number | null;
  requirementsCoverage: number;
  priceCompleteness: number;
  assumptions: string[];
  tradeoffs: string[];
  unresolved: string[];
};

export type ValidationCheckStatus = 'passed' | 'failed' | 'warning';

export type ValidationCheck = {
  code: string;
  status: ValidationCheckStatus;
  message?: string;
  required?: unknown;
  actual?: unknown;
};

export type RepairSuggestion = {
  action: 'add_component' | 'replace_component' | 'raise_quantity' | 'clarify_requirement';
  componentId?: string;
  role?: string;
  requiredCapabilities?: string[];
  message?: string;
};

export type ValidationReport = {
  valid: boolean;
  coverage: number;
  checks: ValidationCheck[];
  repairSuggestions: RepairSuggestion[];
};

export type ComparisonRow = {
  solutionId: string;
  provider: string;
  providerName: string;
  monthlyCostRub: number | null;
  requirementCoverage: number;
  priceCompleteness: number;
  status: SolutionStatus;
};

export type ComparisonMatrix = {
  comparison: ComparisonRow[];
  paretoOptimalSolutionIds: string[];
  dimensions: string[];
};

export type ComposeInput = {
  solutionType: SolutionType;
  requirements?: RequirementSpec;
  providers?: string[];
  strategy?: ComposeStrategy;
  maxSolutions?: number;
  allowCrossProvider?: boolean;
  budgetMonthRub?: number;
};

export type SearchCatalogInput = {
  text?: string;
  entityTypes?: CatalogEntityType[];
  filters?: CatalogFilter[];
  providers?: string[];
  region?: string;
  limit?: number;
  /** Legacy shortcut fields (also accepted via filters). */
  category?: string;
  gpuModel?: string;
  aiModel?: string;
  storageClass?: string;
  meterKind?: 'capacity' | 'requests';
  volumeGiB?: number;
};
