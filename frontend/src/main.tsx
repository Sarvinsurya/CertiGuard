import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { ToastProvider } from "./components/ui";
import { Layout } from "./components/Layout";
import { Login } from "./pages/auth/Login";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { AccountSecurity } from "./pages/auth/AccountSecurity";
import { Dashboard } from "./pages/Dashboard";
import { Register } from "./pages/Register";
import { Registry } from "./pages/Registry";
import { Verify } from "./pages/Verify";
import { HashLab } from "./pages/HashLab";
import { SignatureLab } from "./pages/SignatureLab";
import { CertificateDetails } from "./pages/CertificateDetails";
import { Issuers } from "./pages/Issuers";
import { EncryptionLab } from "./pages/privacy/EncryptionLab";
import { PiiLab } from "./pages/privacy/PiiLab";
import { MaskingLab } from "./pages/privacy/MaskingLab";
import { PseudonymizationLab } from "./pages/privacy/PseudonymizationLab";
import { MinimizationLab } from "./pages/privacy/MinimizationLab";
import { VisualCryptographyLab } from "./pages/privacy/VisualCryptographyLab";
import { SteganographyLab } from "./pages/privacy/SteganographyLab";
import { UserManagement } from "./pages/admin/UserManagement";
import { Roles } from "./pages/admin/Roles";
import { SecurityOverview, SecurityEvents, RiskMonitoring } from "./pages/admin/Security";
import { Incidents } from "./pages/admin/Incidents";
import { Simulations } from "./pages/admin/Simulations";
import { AuditLogs, AuditIntegrity } from "./pages/admin/Audit";
import { Profile, Settings, PlatformHealth, MyCertificates } from "./pages/System";
import "./theme.css";

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: "register", element: <Register /> },
      { path: "registry", element: <Registry /> },
      { path: "verify", element: <Verify /> },
      { path: "issuers", element: <Issuers /> },
      { path: "my-certificates", element: <MyCertificates /> },
      { path: "certificates/:certificateId", element: <CertificateDetails /> },
      { path: "lab/hash", element: <HashLab /> },
      { path: "lab/signature", element: <SignatureLab /> },
      { path: "privacy/encryption", element: <EncryptionLab /> },
      { path: "privacy/pii", element: <PiiLab /> },
      { path: "privacy/masking", element: <MaskingLab /> },
      { path: "privacy/pseudonymization", element: <PseudonymizationLab /> },
      { path: "privacy/minimization", element: <MinimizationLab /> },
      { path: "privacy/visual-cryptography", element: <VisualCryptographyLab /> },
      { path: "privacy/steganography", element: <SteganographyLab /> },
      { path: "users", element: <UserManagement /> },
      { path: "roles", element: <Roles /> },
      { path: "account", element: <AccountSecurity /> },
      { path: "security", element: <SecurityOverview /> },
      { path: "security/events", element: <SecurityEvents /> },
      { path: "security/risk", element: <RiskMonitoring /> },
      { path: "security/incidents", element: <Incidents /> },
      { path: "security/simulations", element: <Simulations /> },
      { path: "audit", element: <AuditLogs /> },
      { path: "audit/integrity", element: <AuditIntegrity /> },
      { path: "platform-health", element: <PlatformHealth /> },
      { path: "settings", element: <Settings /> },
      { path: "profile", element: <Profile /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
);
