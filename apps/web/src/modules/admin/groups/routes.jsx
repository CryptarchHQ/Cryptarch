import { Link } from "react-router-dom";
import { GroupsPage } from "./GroupsPage";
import { NewPermissionsGroupPage } from "./NewPermissionsGroupPage";
import "./newPermissionsGroupPage.css";

export const groupsRoutes = [
  {
    path: "groups",
    element: (
      <GroupsPage
        headerActions={
          <Link
            to="/admin/groups/permissions/new"
            className="permissions-assistant-link"
          >
            Crear con asistente
          </Link>
        }
      />
    ),
  },
  {
    path: "groups/permissions/new",
    element: <NewPermissionsGroupPage />,
  },
];
