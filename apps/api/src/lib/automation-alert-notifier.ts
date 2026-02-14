import type { AutomationAlertSeverity, AutomationAlertStatus, AutomationAlertType, Prisma } from "@prisma/client";

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseEnabled(value: string | undefined, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function trimToNull(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export type AutomationAlertNotificationPayload = {
  id: string;
  ownerId: string | null;
  projectId: string | null;
  scheduledJobId: string | null;
  jobRunId: string | null;
  type: AutomationAlertType;
  severity: AutomationAlertSeverity;
  status: AutomationAlertStatus;
  title: string;
  message: string;
  thresholdValue: number | null;
  observedValue: number | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
};

export type AutomationAlertDeliveryAttempt = {
  provider: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  attemptedAt: string;
  responseStatus: number | null;
  error: string | null;
};

export type AutomationAlertNotifier = {
  notify: (payload: AutomationAlertNotificationPayload) => Promise<AutomationAlertDeliveryAttempt>;
};

export type AutomationAlertNotifierConfig = {
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookTimeoutMs: number;
  webhookAuthHeader: string;
  webhookAuthToken: string | null;
};

export function getAutomationAlertNotifierConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AutomationAlertNotifierConfig {
  return {
    webhookEnabled: parseEnabled(env.AUTOMATION_ALERT_WEBHOOK_ENABLED, false),
    webhookUrl: trimToNull(env.AUTOMATION_ALERT_WEBHOOK_URL),
    webhookTimeoutMs: parsePositiveInt(env.AUTOMATION_ALERT_WEBHOOK_TIMEOUT_MS, 5_000),
    webhookAuthHeader: trimToNull(env.AUTOMATION_ALERT_WEBHOOK_AUTH_HEADER) ?? "authorization",
    webhookAuthToken: trimToNull(env.AUTOMATION_ALERT_WEBHOOK_AUTH_TOKEN)
  };
}

export function createAutomationAlertNotifier(config = getAutomationAlertNotifierConfigFromEnv()): AutomationAlertNotifier {
  const notifyWebhook = async (payload: AutomationAlertNotificationPayload): Promise<AutomationAlertDeliveryAttempt> => {
    const attemptedAt = new Date().toISOString();

    if (!config.webhookEnabled || !config.webhookUrl) {
      return {
        provider: "webhook",
        status: "SKIPPED",
        attemptedAt,
        responseStatus: null,
        error: !config.webhookEnabled ? "webhook transport disabled" : "webhook url not configured"
      };
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.webhookTimeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };

      if (config.webhookAuthToken) {
        headers[config.webhookAuthHeader] = config.webhookAuthToken;
      }

      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event: "automation.alert",
          sentAt: attemptedAt,
          alert: payload
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        return {
          provider: "webhook",
          status: "FAILED",
          attemptedAt,
          responseStatus: response.status,
          error: `HTTP ${response.status}`
        };
      }

      return {
        provider: "webhook",
        status: "SENT",
        attemptedAt,
        responseStatus: response.status,
        error: null
      };
    } catch (error) {
      return {
        provider: "webhook",
        status: "FAILED",
        attemptedAt,
        responseStatus: null,
        error: error instanceof Error ? error.message : "webhook send failed"
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async notify(payload) {
      return notifyWebhook(payload);
    }
  };
}
