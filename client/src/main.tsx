import { annualHeaders, captureAnnualDocumentScope, initializeAnnualDocumentScope, persistManagementYear } from "@/lib/annualWorkspace";
import { markAnnualDraftSaved, trackAnnualRequest } from "@/lib/annualNavigation";
import { getCompanyIdFromSession } from "@/lib/sessionScope";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

/** Umami solo si ambas variables están definidas (evita URLs con %VITE_*% sin sustituir). */
function injectAnalyticsIfConfigured() {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
  if (!endpoint || !websiteId) return;
  const base = String(endpoint).replace(/\/$/, "");
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${base}/umami`;
  script.setAttribute("data-website-id", websiteId);
  document.body.appendChild(script);
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Defer navigation so React is not mid-commit when the document unloads.
  queueMicrotask(() => {
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  });
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "success") markAnnualDraftSaved();
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

injectAnalyticsIfConfigured();

async function startAnnualClient() {
  let companyId = getCompanyIdFromSession();
  try {
    const response = await fetch("/api/auth/session/me", { credentials: "include" });
    const session = await response.json();
    if (session.authenticated && (session.kind === "company_manager" || session.kind === "process_leader")) companyId = session.companyId;
  } catch { /* Existing authentication hooks still enforce login. */ }
  const requestedYear = Number(new URLSearchParams(window.location.search).get("managementYear"));
  if (companyId && Number.isInteger(requestedYear) && requestedYear >= 2026 && requestedYear <= 9999) persistManagementYear(localStorage, companyId, requestedYear);
  const scope = captureAnnualDocumentScope(companyId, localStorage);
  initializeAnnualDocumentScope(scope);
  const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      headers({ op }) {
        const input = op.input as { companyId?: unknown } | undefined;
        const id = Number(input?.companyId);
        // Never batch different companies. Years were captured once at startup.
        return annualHeaders(scope, Number.isSafeInteger(id) && id > 0 ? id : scope.companyId);
      },
      fetch(input, init) {
        return trackAnnualRequest(globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        }));
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

}
void startAnnualClient().catch(error => { console.error("No se pudo iniciar el contexto anual", error); document.getElementById("root")!.textContent = "No se pudo iniciar la plataforma. Recarga para volver a intentar."; });
