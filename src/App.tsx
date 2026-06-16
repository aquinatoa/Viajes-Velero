import { useEffect, useRef, useState } from "react";
import { InputField, TextAreaField } from "./components/Field";
import { SectionCard } from "./components/SectionCard";
import { Sidebar } from "./components/sidebar/Sidebar";
import { useSidebar } from "./components/sidebar/useSidebar";
import { Topbar } from "./components/Topbar";
import { type Page, pageFromPath, routeForPage } from "./router";
import { StatusPill } from "./components/StatusPill";
import { InventoryDocumentsPanel } from "./components/inventory/InventoryDocumentsPanel";
import { LoginPage } from "./components/LoginPage";
import { UsersPanel } from "./components/admin/UsersPanel";
import { AuditPanel } from "./components/admin/AuditPanel";
import { MiCuentaPanel } from "./components/admin/MiCuentaPanel";
import { HomeLanding } from "./components/home/HomeLanding";
import { PlanRequestModal } from "./components/plan/PlanRequestModal";
import type {
  Client,
  CrmPayload,
  CurrentUser,
  FindCandidateOpportunitiesResult,
  ParseTripRequestInput,
  ParseTripRequestResult,
  ProposalBuilderState,
  SearchAccommodationsResult,
  SearchActivitiesResult,
  TripProposal,
  TripRequest,
  ValidateTripRequestResult,
} from "./domain/types";
import {
  buildProposal,
  findCandidateOpportunities,
  logCrmSyncAttempt,
  parseTripRequest,
  prepareNewOpportunityPayload,
  saveNormalizedTripRequest,
  upsertClientFromRequest,
  validateTripRequest,
} from "./services/mcpTools";
import {
  ApiAuthError,
  approveZohoOpportunityApi,
  createZohoOpportunityApi,
  exchangeZohoAuthCodeApi,
  fetchZohoAuthUrlApi,
  searchZohoOpportunitiesApi,
  searchAccommodationsApi,
  searchActivitiesApi,
} from "./services/apiClient";
import {
  type AuthUser,
  getAuthToken,
  logoutApi,
  meApi,
} from "./services/apiClient";

const initialRequestForm: ParseTripRequestInput = {
  clientType: "new",
  email: "",
  firstName: "",
  lastName: "",
  opportunityName: "",
  rawTripRequestText:
    "Hola, somos un colegio de Madrid y necesitamos una propuesta para 42 estudiantes y 4 profesores en Valencia, del 2026-05-11 al 2026-05-15. Buscamos media pensión y actividades para alumnos de 14-17 años.",
};

const initialBuilderState: ProposalBuilderState = {
  selectedAccommodationIds: [],
  activitiesByOption: {
    1: [],
    2: [],
    3: [],
  },
};

/**
 * Puente al usuario de la pantalla inicial. Hoy se construye desde el usuario
 * autenticado del backend; el día que la app viva dentro de Zoho CRM, este es el
 * ÚNICO punto a cambiar (rellenar desde el SDK de Zoho). El rol del backend
 * (ADMIN/USER) se mapea al modelo de la portada (admin/operativo).
 */
function toCurrentUser(user: AuthUser): CurrentUser {
  return {
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    role: user.role === "ADMIN" ? "admin" : "operativo",
  };
}

function newFlowStepText(step: number) {
  switch (step) {
    case 1:
      return "Registro";
    case 2:
      return "Revisión";
    case 3:
      return "Propuesta";
    case 4:
      return "Enviar a CRM";
    default:
      return "Nuevo";
  }
}

export function App() {
  const isZohoCallback = typeof window !== "undefined" && window.location.pathname === "/callback";
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const proposalSectionRef = useRef<HTMLDivElement | null>(null);
  const crmSectionRef = useRef<HTMLDivElement | null>(null);

  // Navegación por URL (router propio, History API). currentPage se deriva.
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  );
  const currentPage: Page = pageFromPath(currentPath) ?? "new";
  const sidebarUi = useSidebar();
  const [newStep, setNewStep] = useState(1);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  // Reaccionar a los botones atrás/adelante del navegador.
  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Navega a una ruta real (actualiza la URL y limpia avisos).
  const navigatePath = (path: string) => {
    if (typeof window !== "undefined" && path !== window.location.pathname) {
      window.history.pushState({}, "", path);
    }
    setCurrentPath(path);
    setUiError("");
    setUiMessage("");
  };

  // Sesión / autenticación.
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Normaliza rutas no reconocidas (p. ej. "/") a la página inicial una vez con
  // sesión, para que la URL y el item activo del menú queden coherentes.
  useEffect(() => {
    if (!currentUser || isZohoCallback) return;
    if (pageFromPath(currentPath) === null) {
      const target = routeForPage("home");
      window.history.replaceState({}, "", target);
      setCurrentPath(target);
    }
  }, [currentUser, currentPath, isZohoCallback]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!getAuthToken()) {
        setAuthChecking(false);
        return;
      }
      try {
        const { user } = await meApi();
        if (!cancelled) setCurrentUser(user);
      } catch {
        if (!cancelled) setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    }
    void check();
    const onUnauth = () => setCurrentUser(null);
    window.addEventListener("velero:unauthenticated", onUnauth);
    return () => {
      cancelled = true;
      window.removeEventListener("velero:unauthenticated", onUnauth);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutApi();
    } finally {
      setCurrentUser(null);
      navigatePath(routeForPage("new"));
    }
  };

  const [requestForm, setRequestForm] = useState<ParseTripRequestInput>(initialRequestForm);
  const [client, setClient] = useState<Client | null>(null);
  const [parseResult, setParseResult] = useState<ParseTripRequestResult | null>(null);
  const [savedTripRequest, setSavedTripRequest] = useState<TripRequest | null>(null);
  const [validationResult, setValidationResult] = useState<ValidateTripRequestResult | null>(null);
  const [candidateOpportunityResult, setCandidateOpportunityResult] =
    useState<FindCandidateOpportunitiesResult | null>(null);
  const [accommodationSearch, setAccommodationSearch] = useState<SearchAccommodationsResult | null>(null);
  const [activitySearch, setActivitySearch] = useState<SearchActivitiesResult | null>(null);
  const [builderState, setBuilderState] = useState<ProposalBuilderState>(initialBuilderState);
  const [proposal, setProposal] = useState<TripProposal | null>(null);
  const [crmPayload, setCrmPayload] = useState<CrmPayload | null>(null);
  const [createdOpportunity, setCreatedOpportunity] = useState<{
    dealId: string | null;
    contactId: string | null;
    accountId: string | null;
  } | null>(null);

  const [existingEmail, setExistingEmail] = useState("coordinacion@institutomar.es");
  const [existingSearchResult, setExistingSearchResult] = useState<{
    opportunities: Array<{
      id: string;
      dealName: string;
      stage: string;
      raw: Record<string, unknown>;
    }>;
  } | null>(null);
  const [selectedExistingOpportunityId, setSelectedExistingOpportunityId] = useState("");
  const [selectedExistingOption, setSelectedExistingOption] = useState<number | null>(null);
  const [existingApprovalPayload, setExistingApprovalPayload] = useState<Record<string, unknown> | null>(null);

  const [uiMessage, setUiMessage] = useState("");
  const [uiError, setUiError] = useState("");
  const [isProcessingZohoCallback, setIsProcessingZohoCallback] = useState(isZohoCallback);
  const [zohoCallbackMessage, setZohoCallbackMessage] = useState(
    isZohoCallback ? "Validando la autenticación de Zoho..." : "",
  );

  useEffect(() => {
    if (!isZohoCallback) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      setIsProcessingZohoCallback(false);
      setZohoCallbackMessage(`Zoho devolvió un error de autenticación: ${error}`);
      return;
    }

    if (!code) {
      setIsProcessingZohoCallback(false);
      setZohoCallbackMessage("No se recibió código de autorización desde Zoho.");
      return;
    }

    exchangeZohoAuthCodeApi(code)
      .then((result) => {
        setZohoCallbackMessage(
          `Zoho quedó autenticado. Guarda el nuevo refresh token en tu .env si quieres persistirlo tras reiniciar el servidor: ${result.refreshToken}`,
        );
        window.history.replaceState({}, "", "/");
      })
      .catch((exchangeError) => {
        setZohoCallbackMessage(
          exchangeError instanceof Error
            ? exchangeError.message
            : "No se pudo completar la autenticación de Zoho.",
        );
      })
      .finally(() => {
        setIsProcessingZohoCallback(false);
      });
  }, [isZohoCallback]);

  const scrollToSection = (section: HTMLDivElement | null) => {
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleApiError = async (error: unknown, fallbackMessage: string) => {
    setUiMessage("");

    if (error instanceof ApiAuthError) {
      const authUrl = error.authUrl ?? (await fetchZohoAuthUrlApi().catch(() => ""));
      setUiError("La sesión de Zoho ha caducado. Te redirigimos para autenticar de nuevo.");

      if (authUrl && typeof window !== "undefined") {
        window.location.href = authUrl;
        return;
      }
    }

    setUiError(error instanceof Error ? error.message : fallbackMessage);
  };

  const resetNewFlow = () => {
    setParseResult(null);
    setSavedTripRequest(null);
    setValidationResult(null);
    setCandidateOpportunityResult(null);
    setAccommodationSearch(null);
    setActivitySearch(null);
    setBuilderState(initialBuilderState);
    setProposal(null);
    setCrmPayload(null);
    setCreatedOpportunity(null);
    setNewStep(1);
  };

  const handleParseRequest = async () => {
    try {
      const parsed = parseTripRequest(requestForm);
      const nextValidation = validateTripRequest({
        clientType: requestForm.clientType,
        email: requestForm.email,
        firstName: requestForm.firstName,
        lastName: requestForm.lastName,
        normalized: parsed.normalized,
      });
      const nextClient = await upsertClientFromRequest(requestForm);
      const opportunities = await findCandidateOpportunities(nextClient, parsed.normalized);

      setClient(nextClient);
      setParseResult(parsed);
      setValidationResult(nextValidation);
      setCandidateOpportunityResult(opportunities);
      setSavedTripRequest(null);
      setAccommodationSearch(null);
      setActivitySearch(null);
      setBuilderState(initialBuilderState);
      setProposal(null);
      setCrmPayload(null);
      setCreatedOpportunity(null);
      setNewStep(2);
      setUiError("");
      setUiMessage(
        parsed.missingFields.length > 0
          ? "Solicitud normalizada con campos pendientes."
          : "Solicitud normalizada y lista para búsqueda.",
      );
      requestAnimationFrame(() => scrollToSection(reviewSectionRef.current));
    } catch (error) {
      setUiMessage("");
      setUiError(error instanceof Error ? error.message : "No se pudo normalizar la solicitud.");
    }
  };

  const updateNormalizedField = <K extends keyof ParseTripRequestResult["normalized"]>(
    field: K,
    value: ParseTripRequestResult["normalized"][K],
  ) => {
    setParseResult((current) => {
      if (!current) {
        return current;
      }

      const next = {
        ...current,
        normalized: {
          ...current.normalized,
          [field]: value,
        },
      };

      setValidationResult(
        validateTripRequest({
          clientType: requestForm.clientType,
          email: requestForm.email,
          firstName: requestForm.firstName,
          lastName: requestForm.lastName,
          normalized: next.normalized,
        }),
      );

      return next;
    });
  };

  const handleSaveNormalized = async () => {
    if (!client || !parseResult) {
      setUiError("Primero necesitas normalizar la solicitud.");
      setUiMessage("");
      return;
    }

    const nextValidation = validateTripRequest({
      clientType: requestForm.clientType,
      email: requestForm.email,
      firstName: requestForm.firstName,
      lastName: requestForm.lastName,
      normalized: parseResult.normalized,
    });

    setValidationResult(nextValidation);

    if (!nextValidation.isValid) {
      setUiError("Faltan datos críticos. Corrígelos antes de buscar inventario.");
      setUiMessage("");
      return;
    }

    try {
      const savedRequest = await saveNormalizedTripRequest(client.id, requestForm, {
        ...parseResult,
        requestStatus: "READY_FOR_SEARCH",
      });
      const filters = {
        destinationText: parseResult.normalized.destinationText,
        destinationCountry: parseResult.normalized.destinationCountry,
        boardType: parseResult.normalized.regimeRequested,
        categoryRequested: parseResult.normalized.categoryRequested,
        dateFrom: parseResult.normalized.dateFrom,
        dateTo: parseResult.normalized.dateTo,
        participants: parseResult.normalized.participants,
        teachers: parseResult.normalized.teachers,
        ageRangeText: parseResult.normalized.ageRangeText,
        averageAgeText: parseResult.normalized.averageAgeText,
      };

      const [nextAccommodationSearch, nextActivitySearch] = await Promise.all([
        searchAccommodationsApi(filters),
        searchActivitiesApi(filters),
      ]);

      setSavedTripRequest(savedRequest);
      setAccommodationSearch(nextAccommodationSearch);
      setActivitySearch(nextActivitySearch);
      setNewStep(3);
      setUiError("");
      setUiMessage(
        `Búsqueda completada: ${nextAccommodationSearch.matches.length} alojamientos y ${nextActivitySearch.matches.length} actividades.`,
      );
      requestAnimationFrame(() => scrollToSection(proposalSectionRef.current));
    } catch (error) {
      await handleApiError(error, "No se pudo guardar y buscar inventario.");
    }
  };

  const toggleAccommodation = (accommodationId: string) => {
    setBuilderState((current) => {
      const alreadySelected = current.selectedAccommodationIds.includes(accommodationId);

      if (alreadySelected) {
        return {
          ...current,
          selectedAccommodationIds: current.selectedAccommodationIds.filter((id) => id !== accommodationId),
        };
      }

      if (current.selectedAccommodationIds.length >= 3) {
        setUiMessage("");
        setUiError("Solo puedes seleccionar hasta 3 alojamientos.");
        return current;
      }

      setUiError("");
      return {
        ...current,
        selectedAccommodationIds: [...current.selectedAccommodationIds, accommodationId],
      };
    });
  };

  const toggleActivityForOption = (optionNumber: number, activityId: string) => {
    if (!builderState.selectedAccommodationIds[optionNumber - 1]) {
      setUiMessage("");
      setUiError("Selecciona primero un alojamiento para esa opción.");
      return;
    }

    setBuilderState((current) => {
      const currentOptionActivities = current.activitiesByOption[optionNumber] ?? [];
      const alreadySelected = currentOptionActivities.includes(activityId);

      return {
        ...current,
        activitiesByOption: {
          ...current.activitiesByOption,
          [optionNumber]: alreadySelected
            ? currentOptionActivities.filter((id) => id !== activityId)
            : [...currentOptionActivities, activityId],
        },
      };
    });
  };

  const handleBuildProposal = async () => {
    if (!savedTripRequest || !parseResult || !accommodationSearch || !activitySearch) {
      setUiMessage("");
      setUiError("Completa la validación y la búsqueda antes de construir la propuesta.");
      return;
    }

    try {
      const nextProposal = await buildProposal({
        tripRequestId: savedTripRequest.id,
        normalized: parseResult.normalized,
        accommodationMatches: accommodationSearch.matches,
        activityMatches: activitySearch.matches,
        builderState,
      });

      setProposal(nextProposal);
      setNewStep(4);
      setUiError("");
      setUiMessage(`Propuesta creada con ${nextProposal.accommodationOptions.length} opciones.`);
      requestAnimationFrame(() => scrollToSection(crmSectionRef.current));
    } catch (error) {
      setUiMessage("");
      setUiError(error instanceof Error ? error.message : "No se pudo construir la propuesta.");
    }
  };

  const handleSendNewOpportunityToCrm = async () => {
    if (!proposal || !parseResult || !client) {
      setUiMessage("");
      setUiError("Necesitas una propuesta válida antes de enviarla a CRM.");
      return;
    }

    try {
      const payload = prepareNewOpportunityPayload({
        client,
        request: parseResult.normalized,
        proposal,
        opportunityRecommendation: candidateOpportunityResult ?? undefined,
      });

      const created = await createZohoOpportunityApi({
        contact: payload.contact as {
          email: string;
          first_name: string;
          last_name: string;
          full_name: string;
        },
        account: payload.account as { crm_account_id?: string | null },
        opportunity: payload.opportunity as {
          opportunity_name?: string;
          destination?: string;
          destination_country?: string;
          date_from?: string;
          date_to?: string;
          participants?: number | null;
          teachers?: number | null;
          group_type?: string;
        },
        proposalOptions: payload.activities,
      });

      logCrmSyncAttempt(payload);
      setCrmPayload(payload);
      setCreatedOpportunity(created);
      setUiError("");
      setUiMessage("Oportunidad creada en Zoho CRM con las 3 opciones.");
    } catch (error) {
      await handleApiError(error, "No se pudo crear la oportunidad en Zoho.");
    }
  };

  const handleSearchExistingOpportunities = async () => {
    try {
      const result = await searchZohoOpportunitiesApi(existingEmail);
      setExistingSearchResult(result);
      setSelectedExistingOpportunityId(result.opportunities[0]?.id ?? "");
      setSelectedExistingOption(null);
      setExistingApprovalPayload(null);
      setUiError("");
      setUiMessage(
        result.opportunities.length > 0
          ? `Se encontraron ${result.opportunities.length} oportunidades en Zoho para este cliente.`
          : "No se encontraron oportunidades en Zoho para ese email.",
      );
    } catch (error) {
      await handleApiError(error, "No se pudieron buscar oportunidades en Zoho.");
    }
  };

  const handleApproveExistingOpportunity = async () => {
    if (!selectedExistingOpportunityId || selectedExistingOption === null || !existingSearchResult) {
      setUiMessage("");
      setUiError("Selecciona una oportunidad y una opción antes de actualizar CRM.");
      return;
    }

    try {
      const payload = await approveZohoOpportunityApi({
        dealId: selectedExistingOpportunityId,
        approvedOptionNumber: selectedExistingOption,
      });
      logCrmSyncAttempt(payload);
      setExistingApprovalPayload(payload);
      const refreshed = await searchZohoOpportunitiesApi(existingEmail);
      setExistingSearchResult(refreshed);
      setUiError("");
      setUiMessage("La oportunidad existente se ha actualizado en Zoho CRM.");
    } catch (error) {
      await handleApiError(error, "No se pudo actualizar la oportunidad existente.");
    }
  };

  const renderAlerts = () => (
    <>
      {uiError ? <div className="alert alert--error">{uiError}</div> : null}
      {uiMessage ? <div className="alert alert--success">{uiMessage}</div> : null}
    </>
  );

  if (isZohoCallback) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <header className="hero">
            <div>
              <span className="eyebrow">Zoho CRM</span>
              <h2>Reautenticación en curso</h2>
              <p>
                Estamos renovando la sesión del CRM para que el backend siga refrescando el access token automáticamente.
              </p>
            </div>
          </header>

          <SectionCard
            title="Estado de autenticación"
            subtitle="Si el refresh token ya no sirve, vuelve a autorizar la app en Zoho y repite el proceso."
          >
            <div className="review-block crm-block">
              <h3>{isProcessingZohoCallback ? "Procesando..." : "Resultado"}</h3>
              <p>{zohoCallbackMessage}</p>
            </div>
            <div className="action-row">
              <button
                className="button button--primary"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Volver a la app
              </button>
            </div>
          </SectionCard>
        </main>
      </div>
    );
  }


  if (authChecking) {
    return (
      <div className="login-screen">
        <p className="helper-text">Cargando…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        onLoggedIn={(user) => {
          setCurrentUser(user);
          navigatePath(routeForPage("home"));
        }}
      />
    );
  }

  // Pantalla inicial (portada del widget): a pantalla completa, SIN sidebar ni
  // topbar, como el login y el callback de Zoho. Las cards entran al shell normal.
  if (currentPage === "home") {
    return (
      <>
        <HomeLanding
          currentUser={toCurrentUser(currentUser)}
          onNavigate={navigatePath}
          onOpenSettings={() => navigatePath(routeForPage("users"))}
          onPlan={() => setPlanModalOpen(true)}
        />
        <PlanRequestModal open={planModalOpen} onClose={() => setPlanModalOpen(false)} />
      </>
    );
  }

  const pageLabels: Record<Page, string> = {
    home: "Inicio",
    new: "Nuevo registro",
    existing: "Existente",
    inventory: "Inventario documental",
    users: "Usuarios y permisos",
    audit: "Auditoría",
    profile: "Mi cuenta",
  };

  return (
    <div className={`app-shell ${sidebarUi.collapsed ? "app-shell--collapsed" : ""}`}>
      <Sidebar
        user={currentUser}
        currentPath={currentPath}
        onNavigate={navigatePath}
        onLogout={handleLogout}
        ui={sidebarUi}
      />
      <div className="main-area">
      <Topbar
        user={currentUser}
        pageLabel={pageLabels[currentPage]}
        onNavigate={navigatePath}
        onLogout={handleLogout}
      />
      <main className="main-content">
        {currentPage === "new" || currentPage === "existing" || currentPage === "inventory" ? (
        <header className="hero">
          <div>
            <span className="eyebrow">
              {currentPage === "new"
                ? `Flujo Nuevo · Paso ${newStep}: ${newFlowStepText(newStep)}`
                : currentPage === "existing"
                  ? "Flujo Existente"
                  : "Inventario documental"}
            </span>
            <h2>
              {currentPage === "new"
                ? "Alta de nueva oportunidad"
                : currentPage === "existing"
                  ? "Actualización de oportunidad existente"
                  : "Inventario documental"}
            </h2>
            <p>
              {currentPage === "new"
                ? "Nueva solicitud hasta crear una sola oportunidad CRM con hasta 3 opciones."
                : currentPage === "existing"
                  ? "Busca una oportunidad ya creada y marca la opción aprobada para actualizar CRM."
                  : "Importa tarifas desde documentos de proveedores con IA, revísalas y publícalas al inventario operativo."}
            </p>
          </div>
          <div className="hero__meta">
            {currentPage === "new" ? (
              <StatusPill tone="neutral" text={`Paso actual: ${newFlowStepText(newStep)}`} />
            ) : null}
            {currentPage === "new" && createdOpportunity ? (
              <StatusPill tone="success" text="Oportunidad CRM creada" />
            ) : null}
          </div>
        </header>
        ) : null}

        {renderAlerts()}

        {currentPage === "new" ? (
          <div className="content-grid">
            <SectionCard
              title="1. Nueva solicitud"
              subtitle="Este flujo es solo para clientes nuevos o para crear una nueva oportunidad con varias opciones."
              action={
                <div className="action-row">
                  <button className="button" onClick={resetNewFlow}>
                    Reiniciar flujo
                  </button>
                  <button className="button button--primary" onClick={handleParseRequest}>
                    Normalizar solicitud
                  </button>
                </div>
              }
            >
              <div className="form-grid">
                <label className="field">
                  <span>Tipo de cliente</span>
                  <select
                    value={requestForm.clientType}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        clientType: event.target.value as ParseTripRequestInput["clientType"],
                      }))
                    }
                  >
                    <option value="new">Nuevo</option>
                    <option value="existing">Existente</option>
                  </select>
                </label>
                <InputField
                  label="Email"
                  value={requestForm.email}
                  onChange={(event) =>
                    setRequestForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="operations@school.edu"
                />
                <InputField
                  label="Nombre"
                  value={requestForm.firstName}
                  onChange={(event) =>
                    setRequestForm((current) => ({ ...current, firstName: event.target.value }))
                  }
                />
                <InputField
                  label="Apellidos"
                  value={requestForm.lastName}
                  onChange={(event) =>
                    setRequestForm((current) => ({ ...current, lastName: event.target.value }))
                  }
                />
                <InputField
                  label="Nombre de la oportunidad (opcional)"
                  value={requestForm.opportunityName}
                  onChange={(event) =>
                    setRequestForm((current) => ({ ...current, opportunityName: event.target.value }))
                  }
                  placeholder="Viaje escolar costa 2026"
                />
                <div />
                <TextAreaField
                  label="Texto original de la solicitud"
                  value={requestForm.rawTripRequestText}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      rawTripRequestText: event.target.value,
                    }))
                  }
                  rows={7}
                />
              </div>
            </SectionCard>

            <div ref={reviewSectionRef}>
              <SectionCard
                title="2. Revisión normalizada"
                subtitle="Valida los datos antes de pasar a la búsqueda."
                action={
                  <button
                    className="button button--primary"
                    onClick={handleSaveNormalized}
                    disabled={!parseResult}
                  >
                    Guardar y buscar inventario
                  </button>
                }
              >
                {parseResult ? (
                  <>
                    <div className="status-grid">
                      <div className="info-panel">
                        <strong>Estado</strong>
                        <p>{parseResult.requestStatus}</p>
                      </div>
                      <div className="info-panel">
                        <strong>CRM recomendado</strong>
                        <p>{candidateOpportunityResult?.recommendation ?? "Pendiente"}</p>
                      </div>
                    </div>

                    {parseResult.missingFields.length > 0 ? (
                      <div className="review-block review-block--missing">
                        <h3>Campos pendientes</h3>
                        <ul className="flat-list">
                          {parseResult.missingFields.map((item) => (
                            <li key={`${item.field}-${item.reason}`}>
                              <strong>{item.label}:</strong> {item.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {validationResult?.issues.length ? (
                      <div className="review-block review-block--error">
                        <h3>Validación</h3>
                        <ul className="flat-list">
                          {validationResult.issues.map((item) => (
                            <li key={`${item.field}-${item.message}`}>
                              <strong>{item.label}:</strong> {item.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="form-grid">
                      <InputField
                        label="Destino"
                        value={parseResult.normalized.destinationText}
                        onChange={(event) => updateNormalizedField("destinationText", event.target.value)}
                      />
                      <InputField
                        label="País del destino"
                        value={parseResult.normalized.destinationCountry}
                        onChange={(event) => updateNormalizedField("destinationCountry", event.target.value)}
                      />
                      <InputField
                        label="Fecha inicio"
                        type="date"
                        value={parseResult.normalized.dateFrom}
                        onChange={(event) => updateNormalizedField("dateFrom", event.target.value)}
                      />
                      <InputField
                        label="Fecha fin"
                        type="date"
                        value={parseResult.normalized.dateTo}
                        onChange={(event) => updateNormalizedField("dateTo", event.target.value)}
                      />
                      <InputField
                        label="Participantes"
                        type="number"
                        value={parseResult.normalized.participants === null ? "" : String(parseResult.normalized.participants)}
                        onChange={(event) =>
                          updateNormalizedField("participants", event.target.value ? Number(event.target.value) : null)
                        }
                      />
                      <InputField
                        label="Profesores"
                        type="number"
                        value={parseResult.normalized.teachers === null ? "" : String(parseResult.normalized.teachers)}
                        onChange={(event) =>
                          updateNormalizedField("teachers", event.target.value ? Number(event.target.value) : null)
                        }
                      />
                      <InputField
                        label="Rango de edad"
                        value={parseResult.normalized.ageRangeText}
                        onChange={(event) => updateNormalizedField("ageRangeText", event.target.value)}
                      />
                      <InputField
                        label="Régimen solicitado"
                        value={parseResult.normalized.regimeRequested}
                        onChange={(event) => updateNormalizedField("regimeRequested", event.target.value)}
                      />
                      <InputField
                        label="Categoría solicitada"
                        value={parseResult.normalized.categoryRequested}
                        onChange={(event) => updateNormalizedField("categoryRequested", event.target.value)}
                      />
                      <TextAreaField
                        label="Requisitos"
                        value={parseResult.normalized.requirementsText}
                        onChange={(event) => updateNormalizedField("requirementsText", event.target.value)}
                        rows={4}
                      />
                    </div>
                  </>
                ) : (
                  <p className="empty-state">Normaliza primero la solicitud.</p>
                )}
              </SectionCard>
            </div>

            <div ref={proposalSectionRef}>
              <SectionCard
                title="3. Constructor de propuesta"
                subtitle="Selecciona hasta 3 alojamientos y asigna actividades por opción."
                action={
                  <button
                    className="button button--primary"
                    onClick={handleBuildProposal}
                    disabled={
                      !savedTripRequest ||
                      !accommodationSearch ||
                      accommodationSearch.matches.length === 0 ||
                      builderState.selectedAccommodationIds.length === 0
                    }
                  >
                    Construir propuesta
                  </button>
                }
              >
                <div className="proposal-layout">
                  <div>
                    <h3>Alojamientos encontrados</h3>
                    <div className="selection-list">
                      {accommodationSearch?.matches.map((match) => {
                        const selected = builderState.selectedAccommodationIds.includes(match.accommodation.id);
                        return (
                          <button
                            key={match.accommodation.id}
                            className={`selection-card ${selected ? "selection-card--selected" : ""}`}
                            onClick={() => toggleAccommodation(match.accommodation.id)}
                          >
                            <strong>{match.accommodation.accommodationName}</strong>
                            <span>
                              {match.accommodation.locality} • {match.accommodation.categoryType} • {match.rate.boardType}
                            </span>
                            {match.accommodation.sourceDocumentName ? (
                              <span
                                className="origin-tag"
                                title="Publicado desde un documento de tarifas"
                              >
                                Origen: {match.accommodation.sourceDocumentName}
                              </span>
                            ) : null}
                            <small>Score {match.score} · {match.matchReasons.join(" ")}</small>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3>Actividades por opción</h3>
                    {[1, 2, 3].map((optionNumber) => (
                      <div className="option-activity-block" key={optionNumber}>
                        <div className="option-activity-block__header">
                          <strong>Opción {optionNumber}</strong>
                          <span>
                            {builderState.selectedAccommodationIds[optionNumber - 1]
                              ? "Alojamiento asignado"
                              : "Falta asignar alojamiento"}
                          </span>
                        </div>
                        <div className="activity-chip-list">
                          {activitySearch?.matches.map((match) => {
                            const active =
                              builderState.activitiesByOption[optionNumber]?.includes(match.activity.id);
                            return (
                              <button
                                key={`${optionNumber}-${match.activity.id}`}
                                className={`chip ${active ? "chip--active" : ""}`}
                                onClick={() => toggleActivityForOption(optionNumber, match.activity.id)}
                                title={
                                  match.activity.sourceDocumentName
                                    ? `Origen: ${match.activity.sourceDocumentName}`
                                    : undefined
                                }
                              >
                                {match.activity.activityName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </div>

            <div ref={crmSectionRef}>
              <SectionCard
                title="4. Envío a CRM"
                subtitle="Aquí se crea una única oportunidad CRM que contiene las 3 opciones de propuesta."
                action={
                  <button
                    className="button button--primary"
                    onClick={handleSendNewOpportunityToCrm}
                    disabled={!proposal}
                  >
                    Enviar oportunidad a CRM
                  </button>
                }
              >
                {proposal ? (
                  <>
                    <div className="review-block review-block--success">
                      <h3>Resumen de propuesta</h3>
                      <p>{proposal.summaryText}</p>
                      <ul className="flat-list">
                        {proposal.accommodationOptions.map((option) => (
                          <li key={option.id}>
                            Opción {option.optionNumber}: {option.accommodationNameSnapshot} · {option.totalPvpText}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {createdOpportunity ? (
                      <div className="review-block crm-block">
                        <h3>Oportunidad enviada</h3>
                        <p>Deal creado en Zoho con ID {createdOpportunity.dealId ?? "pendiente"}.</p>
                      </div>
                    ) : null}

                    <pre className="json-preview">
                      {JSON.stringify(
                        crmPayload ?? { hint: "Envía la oportunidad para ver el payload CRM con las 3 opciones." },
                        null,
                        2,
                      )}
                    </pre>
                  </>
                ) : (
                  <p className="empty-state">Construye una propuesta para crear la oportunidad CRM.</p>
                )}
              </SectionCard>
            </div>
          </div>
        ) : null}

        {currentPage === "existing" ? (
          <div className="content-grid">
            <SectionCard
              title="Buscar oportunidad existente"
              subtitle="Este flujo se usa para localizar una oportunidad ya creada y marcar la opción finalmente aprobada."
              action={
                <button className="button button--primary" onClick={handleSearchExistingOpportunities}>
                  Buscar oportunidad
                </button>
              }
            >
              <div className="form-grid">
                <InputField
                  label="Email del cliente"
                  value={existingEmail}
                  onChange={(event) => setExistingEmail(event.target.value)}
                  placeholder="coordinacion@institutomar.es"
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Actualizar oportunidad CRM"
              subtitle="Selecciona la oportunidad y la opción aprobada para preparar la actualización."
              action={
                <button
                  className="button button--primary"
                  onClick={handleApproveExistingOpportunity}
                  disabled={!selectedExistingOpportunityId || selectedExistingOption === null}
                >
                  Actualizar CRM con opción aprobada
                </button>
              }
            >
              {existingSearchResult ? (
                <>
                  {existingSearchResult.opportunities.length > 0 ? (
                    <div className="selection-list">
                      {existingSearchResult.opportunities.map((opportunity) => (
                        <button
                          key={opportunity.id}
                          className={`selection-card ${selectedExistingOpportunityId === opportunity.id ? "selection-card--selected" : ""}`}
                          onClick={() => {
                            setSelectedExistingOpportunityId(opportunity.id);
                            setSelectedExistingOption(null);
                          }}
                        >
                          <strong>{opportunity.dealName}</strong>
                          <span>
                            ID {opportunity.id} · Estado {opportunity.stage}
                          </span>
                          <span>Oportunidad Zoho encontrada por email</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No hay oportunidades disponibles para este email.</p>
                  )}

                  {selectedExistingOpportunityId ? (
                    <div className="review-block">
                      <h3>Opción aprobada</h3>
                      <div className="action-row">
                        {[1, 2, 3].map((optionNumber) => (
                          <button
                            key={optionNumber}
                            className={`button ${selectedExistingOption === optionNumber ? "button--primary" : ""}`}
                            onClick={() => setSelectedExistingOption(optionNumber)}
                          >
                            Opción {optionNumber}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <pre className="json-preview">
                    {JSON.stringify(
                      existingApprovalPayload ?? { hint: "Selecciona una oportunidad y marca la opción aprobada." },
                      null,
                      2,
                    )}
                  </pre>
                </>
              ) : (
                <p className="empty-state">Busca primero una oportunidad existente.</p>
              )}
            </SectionCard>
          </div>
        ) : null}

        {currentPage === "inventory" ? (
          <div className="content-grid">
            <InventoryDocumentsPanel />
          </div>
        ) : null}

        {currentPage === "users" ? (
          <div className="content-grid">
            <UsersPanel currentUser={currentUser} />
          </div>
        ) : null}

        {currentPage === "audit" ? (
          <div className="content-grid">
            <AuditPanel />
          </div>
        ) : null}

        {currentPage === "profile" ? (
          <div className="content-grid">
            <MiCuentaPanel currentUser={currentUser} />
          </div>
        ) : null}
      </main>
      </div>
    </div>
  );
}