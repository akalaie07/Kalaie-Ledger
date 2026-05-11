export type {
  ImportSource,
  NormalizedEventType,
  NormalizedPlanType,
  NormalizedImportRow,
  PreviewClassification,
  PreviewAction,
  PreviewItem,
  FuzzyMatch,
} from "./types";

export { findFuzzyMatches } from "./fuzzy";

export { parseCopecartExport } from "./adapters/copecart";
export { parseAblefyExport } from "./adapters/ablefy";
export { parseDigistoreExport } from "./adapters/digistore";
export { parseLegacyXlsxImport } from "./adapters/legacy-xlsx";

export { classifyRows } from "./preview";
export type { DealContext, InstallmentContext } from "./preview";
