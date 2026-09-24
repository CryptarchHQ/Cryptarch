import { Navigate } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "./guards";
import { AdminLayout } from "../modules/admin/AdminLayout";
import { AdminResourcePage } from "../modules/admin/AdminResourcePage";
import { authRoutes } from "../modules/auth/routes";
import { chatRoutes } from "../modules/chat/routes";
import { usersRoutes } from "../modules/admin/users/routes";
import { integrationsRoutes } from "../modules/admin/integrations/routes";
import { wizardRoutes } from "../modules/admin/integrations/wizardRoutes";
import { documentsRoutes } from "../modules/admin/documents/routes";
import { tagsRoutes } from "../modules/admin/tags/routes";
import { filtersRoutes } from "../modules/admin/filters/routes";
import { groupsRoutes } from "../modules/admin/groups/routes";

export const appRoutes = [
  {
    path: "/",
    element: <Navigate to="/chat" replace />,
  },
  ...authRoutes,
  {
    element: <RequireAuth />,
    children: [
      ...chatRoutes,
      {
        element: <RequireAdmin />,
        children: [
          {
            path: "/admin",
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to="/admin/users" replace /> },
              ...usersRoutes,
              ...integrationsRoutes,
              ...wizardRoutes,
              ...documentsRoutes,
              ...tagsRoutes,
              ...filtersRoutes,
              ...groupsRoutes,
              { path: ":resource", element: <AdminResourcePage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/chat" replace />,
  },
];
