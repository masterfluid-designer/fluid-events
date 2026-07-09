import { admin } from "better-auth/plugins";
import { adminClient } from "better-auth/client/plugins";
import { ac, roles } from "./permissions";

export const authorizationPlugins = [
  admin({
    ac,
    roles,
    defaultRole: "viewer",
    adminRole: "admin",
  }),
];

export const authorizationClient = [adminClient()];
