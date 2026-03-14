const rawDomains = import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS ?? "mta.ca,umoncton.ca";

export const appConfig = {
  allowedDomains: rawDomains.split(",").map((d: string) => d.trim().toLowerCase()),
  appsScriptUrl: import.meta.env.VITE_APPS_SCRIPT_URL ?? "",
  appName: "Office Hours Planner"
};
