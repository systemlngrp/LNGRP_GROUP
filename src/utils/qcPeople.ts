import type { User } from "../types";

export const isActiveQcPerson = (user: User) =>
  user.designation?.trim().toLowerCase() === "qc person" &&
  user.status !== "Inactive" && Boolean(user.name?.trim());

export const qcPersonOptions = (users: User[], selectedNames: string[] = []) =>
  [...new Set([...users.filter(isActiveQcPerson).map((user) => user.name.trim()), ...selectedNames.map((name) => name.trim()).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }));
