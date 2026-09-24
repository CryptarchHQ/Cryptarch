import { Navigate } from "react-router-dom";
import { IntegrationsPage } from "./IntegrationsPage";

export const integrationsRoutes = [
  { path: "integrations", element: <IntegrationsPage /> },
  { path: "integrations/:id", element: <IntegrationsPage /> },
  {
    path: "connectors",
    element: <Navigate to="/admin/integrations" replace />,
  },
];
