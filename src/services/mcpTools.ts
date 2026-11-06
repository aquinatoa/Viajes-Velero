export {
  parseTripRequest,
  readTripMessage,
  validateTripRequest,
  upsertClientFromRequest,
  saveNormalizedTripRequest,
  findCandidateOpportunities,
  extractClientInfo,
  completarDatosDeContacto,
  sugerirDepartamento,
  extractRequestExtras
} from "./requestService";
export { buildProposal, approveProposal, confirmFinalSelection } from "./proposalService";
export {
  prepareCrmPayload,
  prepareNewOpportunityPayload,
  logCrmSyncAttempt
} from "./crmService";
