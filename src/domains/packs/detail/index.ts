/** Per-question detail for every industry pack, keyed by pack id then question id. One file per pack keeps each under the line cap. */
import type { PackQuestionDetail } from "../../industryPacks.js";
import { farmToForkDetail } from "./farm-to-fork.js";
import { weaveToWearDetail } from "./weave-to-wear.js";
import { materialToMachinesDetail } from "./material-to-machines.js";
import { sourceToSustenanceDetail } from "./source-to-sustenance.js";
import { ubiquityToUtilityDetail } from "./ubiquity-to-utility.js";
import { sipToSanitationDetail } from "./sip-to-sanitation.js";
import { digitalHealthRecordDetail } from "./digital-health-record.js";
import { wellnessManagementDetail } from "./wellness-management.js";
import { patientLifecycleDetail } from "./patient-lifecycle.js";
import { clinicalLifecycleDetail } from "./clinical-lifecycle.js";
import { professionalPracticeDetail } from "./professional-practice.js";
import { lifeTechnologyDetail } from "./life-technology.js";
import { drugDiscoveryDetail } from "./drug-discovery.js";
import { clinicalTrialsDetail } from "./clinical-trials.js";
import { specializedMedicineDetail } from "./specialized-medicine.js";
import { futureOfWorkDetail } from "./future-of-work.js";
import { digitalPaymentsDetail } from "./digital-payments.js";
import { noPovertyDetail } from "./no-poverty.js";
import { circularEconomyDetail } from "./circular-economy.js";
import { blockchainDetail } from "./blockchain.js";
import { k12Pm3Detail } from "./k12-pm3.js";
import { higherEducationDetail } from "./higher-education.js";
import { skillsTrainingDetail } from "./skills-training.js";
import { specializedEducationDetail } from "./specialized-education.js";
import { differentlyAbledDetail } from "./differently-abled.js";
import { sustainableCommunitiesDetail } from "./sustainable-communities.js";
import { sustainablePortsDetail } from "./sustainable-ports.js";
import { sustainableRealEstateDetail } from "./sustainable-real-estate.js";
import { virtualInfrastructureDetail } from "./virtual-infrastructure.js";
import { privacySecurityMobilityDetail } from "./privacy-security-mobility.js";
import { freight3plWarehouseDetail } from "./freight-3pl-warehouse.js";
import { cognitionToIntelligenceDetail } from "./cognition-to-intelligence.js";
import { networkedEcosystemsDetail } from "./networked-ecosystems.js";
import { osSustainableOutcomesDetail } from "./os-sustainable-outcomes.js";
import { infotainmentDetail } from "./infotainment.js";
import { partnershipsProsperityDetail } from "./partnerships-prosperity.js";
import { digitalCitizensRightsDetail } from "./digital-citizens-rights.js";
import { danceOfDemocracyDetail } from "./dance-of-democracy.js";
import { petitionToLawDetail } from "./petition-to-law.js";
import { citizenServicesDetail } from "./citizen-services.js";
import { publicPrivateCollaborationDetail } from "./public-private-collaboration.js";

export const PACK_QUESTION_DETAIL: Readonly<Record<string, PackQuestionDetail>> = Object.freeze({
  "farm-to-fork": farmToForkDetail,
  "weave-to-wear": weaveToWearDetail,
  "material-to-machines": materialToMachinesDetail,
  "source-to-sustenance": sourceToSustenanceDetail,
  "ubiquity-to-utility": ubiquityToUtilityDetail,
  "sip-to-sanitation": sipToSanitationDetail,
  "digital-health-record": digitalHealthRecordDetail,
  "wellness-management": wellnessManagementDetail,
  "patient-lifecycle": patientLifecycleDetail,
  "clinical-lifecycle": clinicalLifecycleDetail,
  "professional-practice": professionalPracticeDetail,
  "life-technology": lifeTechnologyDetail,
  "drug-discovery": drugDiscoveryDetail,
  "clinical-trials": clinicalTrialsDetail,
  "specialized-medicine": specializedMedicineDetail,
  "future-of-work": futureOfWorkDetail,
  "digital-payments": digitalPaymentsDetail,
  "no-poverty": noPovertyDetail,
  "circular-economy": circularEconomyDetail,
  "blockchain": blockchainDetail,
  "k12-pm3": k12Pm3Detail,
  "higher-education": higherEducationDetail,
  "skills-training": skillsTrainingDetail,
  "specialized-education": specializedEducationDetail,
  "differently-abled": differentlyAbledDetail,
  "sustainable-communities": sustainableCommunitiesDetail,
  "sustainable-ports": sustainablePortsDetail,
  "sustainable-real-estate": sustainableRealEstateDetail,
  "virtual-infrastructure": virtualInfrastructureDetail,
  "privacy-security-mobility": privacySecurityMobilityDetail,
  "freight-3pl-warehouse": freight3plWarehouseDetail,
  "cognition-to-intelligence": cognitionToIntelligenceDetail,
  "networked-ecosystems": networkedEcosystemsDetail,
  "os-sustainable-outcomes": osSustainableOutcomesDetail,
  "infotainment": infotainmentDetail,
  "partnerships-prosperity": partnershipsProsperityDetail,
  "digital-citizens-rights": digitalCitizensRightsDetail,
  "dance-of-democracy": danceOfDemocracyDetail,
  "petition-to-law": petitionToLawDetail,
  "citizen-services": citizenServicesDetail,
  "public-private-collaboration": publicPrivateCollaborationDetail,
});
