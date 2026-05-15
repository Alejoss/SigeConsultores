import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProcessLeaderAuthProvider } from "./contexts/ProcessLeaderAuthContext";
import { useEffect } from "react";
import * as React from "react";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import CompanyInfo from "./pages/CompanyInfo";
import Values from "./pages/Values";
import ProcessMap from "./pages/ProcessMap";
import ProcessCharacterization from "./pages/ProcessCharacterization";
import SubprocessMap from "./pages/SubprocessMap";
import Policy from "./pages/Policy";
import Indicators from "./pages/Indicators";
import CriticalityMatrix from "./pages/CriticalityMatrix";
import FODAAnalysis from "./pages/FODAAnalysis";
import RiskMatrix from "./pages/RiskMatrix";
import Compliances from "./pages/Compliances";
import Trainings from "./pages/Trainings";
import Documents from "./pages/Documents";
import ConsolidatedSchedule from "./pages/ConsolidatedSchedule";
import Company from "./pages/Company";
import StrategicObjectives from "./pages/StrategicObjectives";
import ProcessStakeholderCriticality from "./pages/ProcessStakeholderCriticality";
import ProcessFODA from "./pages/ProcessFODA";
import ProcessRiskMatrix from "./pages/ProcessRiskMatrix";
import ProcessTacticalObjectives from "./pages/ProcessTacticalObjectives";
import ProcessCompliances from "./pages/ProcessCompliances";
import ProcessTrainings from "./pages/ProcessTrainings";
import ProcessSchedule from "./pages/ProcessSchedule";
import ProcessIndicators from "./pages/ProcessIndicators";
import PolicyObjectives from "./pages/PolicyObjectives";
import Flowchart from "./pages/Flowchart";
import ProcessParticipants from "./pages/ProcessParticipants";
import ProcessResources from "./pages/ProcessResources";
import TacticalDefinition from "./pages/TacticalDefinition";
import TacticalPlanning from "./pages/TacticalPlanning";
import ProceduresCharacterization from "./pages/ProceduresCharacterization";
import RequestCompanyAccess from "./pages/RequestCompanyAccess";
import AdminApproveCompanies from "./pages/AdminApproveCompanies";
import SetupManagerPassword from "./pages/SetupManagerPassword";
import ChangePassword from "./pages/ChangePassword";
import ForgotPassword from "./pages/ForgotPassword";
import SetupProcessLeaderPassword from "./pages/SetupProcessLeaderPassword";
import SetupProcessLeaderPIN from "./pages/SetupProcessLeaderPIN";
import ResetProcessLeaderPIN from "./pages/ResetProcessLeaderPIN";
import ProcessLeaderPINRecovery from "./pages/ProcessLeaderPINRecovery";
import AdminDashboard from "./pages/AdminDashboard";
import FODA from "./pages/FODA";
import RequestCompanyAccessProtected from "./pages/RequestCompanyAccessProtected";
import DebugUserInfo from "./pages/DebugUserInfo";
import ProcessDashboard from "./pages/ProcessDashboard";
import ProcessLeaderDashboard from "./pages/ProcessLeaderDashboard";
import AccessDenied from "./pages/AccessDenied";
import SetupCompany from "./pages/SetupCompany";
import ModuleCustomizationPanel from "./pages/ModuleCustomizationPanel";
import AdminGerentes from "./pages/AdminGerentes";
import ManagerCompanyAdmin from "./pages/ManagerCompanyAdmin";
import AdminJefes from "./pages/AdminJefes";
import ProcessOwnerInvitationAccept from "./pages/ProcessOwnerInvitationAccept";
import PolicyDocuments from "./pages/PolicyDocuments";
import ValuesDocuments from "./pages/ValuesDocuments";
import StrategicObjectivesDocuments from "./pages/StrategicObjectivesDocuments";
import ForgotPasswordManager from "./pages/ForgotPasswordManager";
import ManagerAccess from "./pages/ManagerAccess";
import ManagerDashboard from "./pages/ManagerDashboard";
import LoginSelector from "./pages/LoginSelector";
import ManagerConfirmation from "./pages/ManagerConfirmation";
import ManagerAccessSuccess from "./pages/ManagerAccessSuccess";
import ProcessLeaderAccessSuccess from "./pages/ProcessLeaderAccessSuccess";
import ProcessLeaderInvitationLink from "./pages/ProcessLeaderInvitationLink";
import ManagerEditProfile from "./pages/ManagerEditProfile";
import OrganizationChart from "./pages/OrganizationChart";

// Redirige la raíz: invitación gerente, jefe de proceso, gerente ya logueado, o /login
function RootRedirect() {
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const managerInvitation = urlParams.get("manager-invitation");
        if (managerInvitation) {
          localStorage.removeItem("managerEmail");
          localStorage.removeItem("selectedCompanyId");
          window.location.href = "/login";
          return;
        }

        try {
          const res = await fetch("/api/auth/session/me", { credentials: "include" });
          const data = (await res.json()) as
            | { authenticated: true; kind: "process_leader"; processId: number }
            | { authenticated: true; kind: "company_manager" }
            | { authenticated: false };

          if (data.authenticated && data.kind === "process_leader") {
            window.location.href = `/process-leader-dashboard?processId=${data.processId}`;
            return;
          }
          if (data.authenticated && data.kind === "company_manager") {
            window.location.href = "/manager-dashboard";
            return;
          }
        } catch {
          /* fall through to login */
        }

        setIsRedirecting(true);
        window.location.href = "/login";
      })();
    }, 100);

    return () => clearTimeout(timer);
  }, []);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">{isRedirecting ? "Redirigiendo a login..." : "Cargando..."}</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={RootRedirect} />
      <Route path={"/login"} component={LoginSelector} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/company-info"} component={CompanyInfo} />
      <Route path={"/values"} component={Values} />
      <Route path={"/process-map"} component={ProcessMap} />
      <Route path={"/process-characterization"} component={ProcessCharacterization} />
      <Route path={"/subprocess-map"} component={SubprocessMap} />
      <Route path={"/policy"} component={Policy} />
      <Route path={"/policy-objectives"} component={PolicyObjectives} />
      <Route path={"/flowchart"} component={Flowchart} />
      <Route path={"/process-participants"} component={ProcessParticipants} />
      <Route path={"/process-resources"} component={ProcessResources} />
      <Route path={"/404"} component={NotFound} />
      <Route path={"/indicators"} component={Indicators} />
      <Route path={"/criticality-matrix"} component={CriticalityMatrix} />
      <Route path={"/foda-analysis"} component={FODAAnalysis} />
      <Route path={"/foda"} component={FODA} />
      <Route path={"/risk-matrix"} component={RiskMatrix} />
      <Route path={"/compliances"} component={Compliances} />
      <Route path={"/trainings"} component={Trainings} />
      <Route path={"/documents"} component={Documents} />
      <Route path={"/consolidated-schedule"} component={ConsolidatedSchedule} />
      <Route path={"/company"} component={Company} />
      <Route path={"/strategic-objectives"} component={StrategicObjectives} />
      <Route path={"/process-stakeholder-criticality"} component={ProcessStakeholderCriticality} />
      <Route path={"/process-foda"} component={ProcessFODA} />
      <Route path={"/process-risk-matrix"} component={ProcessRiskMatrix} />
      <Route path={"/process-tactical-objectives"} component={ProcessTacticalObjectives} />
      <Route path={"/tactical-definition"} component={TacticalDefinition} />
      <Route path={"/tactical-planning"} component={TacticalPlanning} />
      <Route path={"/process-compliances"} component={ProcessCompliances} />
      <Route path={"/process-trainings"} component={ProcessTrainings} />
      <Route path={"/process-schedule"} component={ProcessSchedule} />
      <Route path={"/process-indicators"} component={ProcessIndicators} />
      <Route path={"/request-access"} component={RequestCompanyAccess} />
      <Route path={"/admin-approve"} component={AdminApproveCompanies} />
      <Route path={"/setup-password"} component={SetupManagerPassword} />
      <Route path={"/change-password"} component={ChangePassword} />
      <Route path={"/forgot-password"} component={ForgotPassword} />
      <Route path={"/setup-process-leader-password"} component={SetupProcessLeaderPassword} />
      <Route path={"/setup-process-leader-pin"} component={SetupProcessLeaderPIN} />
      <Route path={"/reset-process-leader-pin"} component={ResetProcessLeaderPIN} />
      <Route path={"/admin-dashboard"} component={AdminDashboard} />
      <Route path={"/request-access-protected"} component={RequestCompanyAccessProtected} />
      <Route path={"/debug-user-info"} component={DebugUserInfo} />
      <Route path={"/process-dashboard"} component={ProcessDashboard} />
      <Route path={"/process-leader-pin-recovery"} component={ProcessLeaderPINRecovery} />
      <Route path={"/process-leader-dashboard"} component={ProcessLeaderDashboard} />
      <Route path={"/access-denied"} component={AccessDenied} />
      <Route path={"/setup-company"} component={SetupCompany} />
      <Route path={"/customize-modules"} component={ModuleCustomizationPanel} />
      <Route path={"/admin-gerentes"} component={AdminGerentes} />
      <Route path={"/manager-company-admin"} component={ManagerCompanyAdmin} />
      <Route path={"/admin-jefes"} component={AdminJefes} />
      <Route path={"/process-owner-invitation"} component={ProcessOwnerInvitationAccept} />
      <Route path={"/policy-documents"} component={PolicyDocuments} />
      <Route path={"/values-documents"} component={ValuesDocuments} />
      <Route path={"/strategic-objectives-documents"} component={StrategicObjectivesDocuments} />
      <Route path={"/forgot-password-manager"} component={ForgotPasswordManager} />
      <Route path={"/manager-access"} component={ManagerAccess} />
      <Route path={"/manager-dashboard"} component={ManagerDashboard} />
      <Route path={"/manager-confirmation"} component={ManagerConfirmation} />
      <Route path={"/manager-access-success"} component={ManagerAccessSuccess} />
      <Route path={"/process-leader-access-success"} component={ProcessLeaderAccessSuccess} />
      <Route path={"/process-leader-invitation-link"} component={ProcessLeaderInvitationLink} />
      <Route path={"/manager-edit-profile"} component={ManagerEditProfile} />
      <Route path={"/organization-chart"} component={OrganizationChart} />

      <Route path={"/home"} component={Home} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <ProcessLeaderAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ProcessLeaderAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

