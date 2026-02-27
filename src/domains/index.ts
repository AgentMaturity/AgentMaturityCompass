export {
  DOMAIN_REGISTRY,
  getDomainMetadata,
  isDomain,
  listDomainIds,
  listDomainMetadata,
  parseDomain,
  type Domain,
  type DomainMetadata
} from "./domainRegistry.js";

export {
  DOMAIN_MODULE_MAP,
  TOTAL_MODULE_COUNT,
  findModuleProfile,
  getDomainModuleActivations,
  listModuleDomainProfiles,
  type DomainModuleActivation,
  type ModuleDomainProfile
} from "./domainModuleMap.js";

export {
  assessDomain,
  type ActiveModuleProfile,
  type ComplianceGap,
  type DomainAssessmentInput,
  type DomainAssessmentResult,
  type DomainRoadmapItem
} from "./domainAssessmentEngine.js";

export {
  buildDomainReport,
  renderDomainReportMarkdown,
  type ComplianceGapGroup,
  type DomainReport,
  type ExecutiveSummary,
  type ModuleActivationRow
} from "./domainReportBuilder.js";

export {
  assessDomainForAgent,
  buildDomainAssessmentInput,
  buildDomainReportForAgent,
  getDomainGaps,
  getDomainModules,
  getDomainRoadmap,
  listDomainMetadataCli,
  parseDomainOrThrow,
  runDomainAssurance,
  type DomainAssessmentCliResult,
  type DomainAssurancePackResult,
  type DomainAssuranceRunResult,
  type DomainReportBuildResult
} from "./domainCliIntegration.js";

export {
  INDUSTRY_PACKS,
  getIndustryPack,
  getIndustryPacksByStation,
  getStationSummary,
  listIndustryPackIds,
  listIndustryPacks,
  scoreIndustryPack,
  type IndustryPack,
  type IndustryPackId,
  type IndustryPackQuestion,
  type IndustryPackScoreResult,
} from "./industryPacks.js";
