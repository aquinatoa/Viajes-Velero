import type {
  Accommodation,
  AccommodationRate,
  Activity,
  ActivityRate,
  Client
} from "../domain/types";

export const clients: Client[] = [
  {
    id: "client_1",
    email: "coordinacion@institutomar.es",
    firstName: "Clara",
    lastName: "Soler",
    fullName: "Clara Soler",
    isReturningCustomer: true,
    crmContactId: "ZOHO-CONTACT-001",
    crmAccountId: "ZOHO-ACCOUNT-015"
  },
  {
    id: "client_2",
    email: "travel@colegiopineda.es",
    firstName: "Javier",
    lastName: "Pineda",
    fullName: "Javier Pineda",
    isReturningCustomer: false
  }
];

export const accommodations: Accommodation[] = [
  {
    id: "acc_1",
    accommodationName: "Hotel Brisa Mediterranea",
    locality: "Valencia",
    categoryType: "4*",
    accommodationType: "Hotel",
    observations: "Buena opción para grupos académicos y llegadas en autocar.",
    conditionsText: "Check-in desde las 15:00. Tasa turística no incluida.",
    freePolicy: "1 profesor gratis por cada 25 estudiantes de pago.",
    sourceFile: "hoteles_valencia_2026.xlsx"
  },
  {
    id: "acc_2",
    accommodationName: "Residencia Puerto Azul",
    locality: "Valencia",
    categoryType: "3*",
    accommodationType: "Residencia",
    observations: "Gran capacidad y distribución flexible de habitaciones.",
    conditionsText: "Depósito del 20 %. Lista final 10 días antes de la llegada.",
    freePolicy: "Plaza gratuita para conductor y 1 profesor.",
    sourceFile: "grupos_costa_2026.xlsx"
  },
  {
    id: "acc_3",
    accommodationName: "Campus Costa Rooms",
    locality: "Gandia",
    categoryType: "2*",
    accommodationType: "Hostal",
    observations: "Opción económica con habitaciones múltiples.",
    conditionsText: "Disponibilidad limitada los fines de semana.",
    freePolicy: "Sin gratuidades. Tarifa reducida para personal disponible.",
    sourceFile: "campus_groups_2026.xlsx"
  }
];

export const accommodationRates: AccommodationRate[] = [
  {
    id: "ar_1",
    accommodationId: "acc_1",
    rateSource: "internal_contract",
    year: 2026,
    seasonName: "Primavera",
    dateFrom: "2026-03-01",
    dateTo: "2026-06-30",
    minNights: 2,
    boardType: "pensión completa",
    tariffUnit: "por pax / noche",
    pvpAmount: 69,
    netSaleAmount: 58,
    netAzulmarinoAmount: 54,
    sourceFile: "hoteles_valencia_2026.xlsx",
    sourceSheet: "spring_rates"
  },
  {
    id: "ar_2",
    accommodationId: "acc_2",
    rateSource: "internal_contract",
    year: 2026,
    seasonName: "Primavera",
    dateFrom: "2026-03-01",
    dateTo: "2026-06-30",
    minNights: 2,
    boardType: "media pensión",
    tariffUnit: "por pax / noche",
    pvpAmount: 54,
    netSaleAmount: 45,
    netAzulmarinoAmount: 42,
    sourceFile: "grupos_costa_2026.xlsx",
    sourceSheet: "residence"
  },
  {
    id: "ar_3",
    accommodationId: "acc_3",
    rateSource: "internal_contract",
    year: 2026,
    seasonName: "Primavera",
    dateFrom: "2026-03-01",
    dateTo: "2026-06-30",
    minNights: 1,
    boardType: "alojamiento y desayuno",
    tariffUnit: "por pax / noche",
    pvpAmount: 35,
    netSaleAmount: 29,
    netAzulmarinoAmount: 27,
    sourceFile: "campus_groups_2026.xlsx",
    sourceSheet: "bb"
  }
];

export const activities: Activity[] = [
  {
    id: "act_1",
    activityName: "Visita al museo oceanográfico",
    supplierName: "Museo Marítimo Levante",
    locationMain: "Valencia",
    durationText: "2 horas",
    descriptionText: "Visita educativa guiada centrada en ecosistemas marinos.",
    sourceFile: "activities_valencia_2026.xlsx"
  },
  {
    id: "act_2",
    activityName: "Rally histórico por la ciudad",
    supplierName: "Valencia Edu Tours",
    locationMain: "Valencia",
    durationText: "Medio día",
    descriptionText: "Actividad por equipos por el casco histórico con guías bilingües.",
    sourceFile: "activities_valencia_2026.xlsx"
  },
  {
    id: "act_3",
    activityName: "Taller costero en catamarán",
    supplierName: "Blue Horizon Sailing",
    locationMain: "Gandia",
    durationText: "3 horas",
    descriptionText: "Taller de iniciación a la vela y trabajo en equipo para grupos escolares.",
    sourceFile: "nautical_programs_2026.xlsx"
  }
];

export const activityRates: ActivityRate[] = [
  {
    id: "atr_1",
    activityId: "act_1",
    year: 2026,
    ageLabel: "12-17",
    ageMin: 12,
    ageMax: 17,
    salePvpAmount: 18,
    costNetAmount: 13,
    commissionPercent: 12,
    durationText: "2 horas",
    sourceFile: "activities_valencia_2026.xlsx",
    sourceSheet: "museum"
  },
  {
    id: "atr_2",
    activityId: "act_2",
    year: 2026,
    ageLabel: "12-17",
    ageMin: 12,
    ageMax: 17,
    salePvpAmount: 21,
    costNetAmount: 15,
    commissionPercent: 12,
    durationText: "Medio día",
    sourceFile: "activities_valencia_2026.xlsx",
    sourceSheet: "city_rally"
  },
  {
    id: "atr_3",
    activityId: "act_3",
    year: 2026,
    ageLabel: "14-18",
    ageMin: 14,
    ageMax: 18,
    salePvpAmount: 34,
    costNetAmount: 26,
    commissionPercent: 10,
    durationText: "3 horas",
    sourceFile: "nautical_programs_2026.xlsx",
    sourceSheet: "catamaran"
  }
];
