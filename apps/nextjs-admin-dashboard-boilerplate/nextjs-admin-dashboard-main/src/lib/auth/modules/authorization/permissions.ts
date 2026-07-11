import { createAccessControl } from "better-auth/plugins/access";

export const ac = createAccessControl({
  user: ["read", "update:own", "update:any", "delete"],
  content: ["read", "create", "update", "delete"],
  settings: ["read", "update"],
  adminPanel: ["access"],
});

export const roles = {
  viewer: ac.newRole({
    user: ["read"],
    content: ["read"],
  }),

  editor: ac.newRole({
    user: ["read", "update:own"],
    content: ["read", "create", "update"],
  }),

  admin: ac.newRole({
    user: ["read", "update:own", "update:any", "delete"],
    content: ["read", "create", "update", "delete"],
    settings: ["read", "update"],
    adminPanel: ["access"],
  }),
} as const;

export type AppRole = keyof typeof roles;
