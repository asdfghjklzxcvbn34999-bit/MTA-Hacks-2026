import { appConfig } from "../config";

export function isAllowedSchoolEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0) {
    return false;
  }
  const domain = normalized.slice(atIndex + 1);
  return appConfig.allowedDomains.includes(domain);
}
