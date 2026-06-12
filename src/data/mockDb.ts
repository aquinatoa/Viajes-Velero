import type {
  Client,
  CrmSyncLog,
  CrmOpportunityRecord,
  TripProposal,
  TripRequest
} from "../domain/types";
import { clients as seedClients } from "./mockData";

const store = {
  clients: [...seedClients] as Client[],
  tripRequests: [] as TripRequest[],
  tripProposals: [] as TripProposal[],
  crmSyncLogs: [] as CrmSyncLog[],
  crmOpportunities: [] as CrmOpportunityRecord[]
};

export function getClients() {
  return store.clients;
}

export function findClientByEmail(email: string) {
  return store.clients.find((client) => client.email.toLowerCase() === email.toLowerCase());
}

export function saveClient(client: Client) {
  const existingIndex = store.clients.findIndex((item) => item.id === client.id);

  if (existingIndex >= 0) {
    store.clients[existingIndex] = client;
  } else {
    store.clients.push(client);
  }

  return client;
}

export function saveTripRequest(request: TripRequest) {
  const existingIndex = store.tripRequests.findIndex((item) => item.id === request.id);

  if (existingIndex >= 0) {
    store.tripRequests[existingIndex] = request;
  } else {
    store.tripRequests.push(request);
  }

  return request;
}

export function saveTripProposal(proposal: TripProposal) {
  const existingIndex = store.tripProposals.findIndex((item) => item.id === proposal.id);

  if (existingIndex >= 0) {
    store.tripProposals[existingIndex] = proposal;
  } else {
    store.tripProposals.push(proposal);
  }

  return proposal;
}

export function saveCrmSyncLog(log: CrmSyncLog) {
  store.crmSyncLogs.push(log);
  return log;
}

export function saveCrmOpportunity(opportunity: CrmOpportunityRecord) {
  const existingIndex = store.crmOpportunities.findIndex((item) => item.id === opportunity.id);

  if (existingIndex >= 0) {
    store.crmOpportunities[existingIndex] = opportunity;
  } else {
    store.crmOpportunities.push(opportunity);
  }

  return opportunity;
}

export function findCrmOpportunitiesByEmail(email: string) {
  return store.crmOpportunities.filter(
    (item) => item.clientEmail.toLowerCase() === email.toLowerCase()
  );
}

export function findCrmOpportunityById(id: string) {
  return store.crmOpportunities.find((item) => item.id === id);
}
