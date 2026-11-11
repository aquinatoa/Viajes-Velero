import type { ZohoDealSummary } from "../../services/apiClient";
import type { OportunidadFila } from "../../domain/oportunidadUnificada";

/** Lo que el calendario y el detalle de Zoho necesitan, a partir de una fila. */
export function comoTratoDeZoho(f: OportunidadFila): ZohoDealSummary {
  return {
    id: f.crmDealId ?? f.clave,
    dealName: f.nombre,
    stage: f.fase ?? "",
    arrivalDate: f.llegada ?? "",
    departureDate: f.salida ?? "",
    amount: f.importe,
    closingDate: f.cierre ?? "",
    accountName: f.cuenta,
    contactName: f.contacto,
    description: f.crm?.description ?? "",
    opcionesTexto: f.crm?.opcionesTexto ?? "",
    nextStep: "",
    createdTime: f.crm?.createdTime ?? "",
    modifiedTime: f.crm?.modifiedTime ?? "",
    dealUrl: f.dealUrl ?? "",
    department: f.departamento,
  };
}
