import { PublicOnly } from "../../app/guards";
import { LoginPage } from "./LoginPage";

export const authRoutes = [
  {
    path: "/login",
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
];
