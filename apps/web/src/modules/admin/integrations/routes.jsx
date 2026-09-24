import { Navigate } from "react-router-dom";
import { ConnectorsWorkspace } from "../ConnectorsWorkspace";

export const integrationsRoutes = [
  { path: "integrations", element: <ConnectorsWorkspace /> },
  {
    path: "connectors",
    element: <Navigate to="/admin/integrations" replace />,
  },
];
