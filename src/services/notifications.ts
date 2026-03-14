export interface NotificationPayload {
  recipients: string[];
  subject: string;
  body: string;
}

export interface NotificationSender {
  sendAnnouncement(payload: NotificationPayload): Promise<void>;
}

class NoopSender implements NotificationSender {
  async sendAnnouncement(_payload: NotificationPayload): Promise<void> {
    return Promise.resolve();
  }
}

class AppsScriptNotificationSender implements NotificationSender {
  constructor(private readonly endpoint: string) {}

  async sendAnnouncement(payload: NotificationPayload): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "sendAnnouncementEmail",
        payload
      })
    });
    if (!response.ok) {
      throw new Error("Failed to send announcement email.");
    }
  }
}

export function createNotificationSender(appsScriptUrl: string): NotificationSender {
  if (appsScriptUrl) {
    return new AppsScriptNotificationSender(appsScriptUrl);
  }
  return new NoopSender();
}
