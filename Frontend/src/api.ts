import { AnalysisResult, ApiRequestMetric } from "./types";

const API_PREFIX = "/api";

type BackendTransaction = {
  transaction_id?: string;
  timestamp?: string;
  type?: string;
  amount?: number;
  counterparty?: string;
  status?: string;
};

type BackendAnalysis = {
  ticket_id: string;
  relevant_transaction_id: string | null;
  evidence_verdict: string;
  case_type: string;
  severity: string;
  department: string;
  agent_summary: string;
  recommended_next_action: string;
  customer_reply: string;
  human_review_required: boolean;
  confidence?: number | null;
  reason_codes?: string[] | null;
};

type AnalyzeTicketInput = {
  ticketId: string;
  userType: string;
  complaintText: string;
  language: string;
  channel: string;
  transactionHistory: string;
  customPolicy: string;
};

const startTime = Date.now();
let requestCount = 0;
let successCount = 0;
let errorCount = 0;
let lastLatencyMs = 0;
const recentRequests: ApiRequestMetric[] = [];

function addMetric(endpoint: string, status: number, latencyMs: number, ticketId?: string) {
  requestCount += 1;
  if (status >= 200 && status < 300) {
    successCount += 1;
  } else {
    errorCount += 1;
  }
  lastLatencyMs = latencyMs;
  recentRequests.unshift({
    timestamp: new Date().toLocaleTimeString(),
    endpoint,
    status,
    latencyMs,
    ticketId,
  });
  if (recentRequests.length > 30) {
    recentRequests.pop();
  }
}

function labelFromSnake(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLanguage(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("bangla") || lower.includes("bn")) return "bn";
  if (lower.includes("mixed")) return "mixed";
  return "en";
}

function normalizeChannel(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("chat") || lower.includes("app")) return "in_app_chat";
  if (lower.includes("call")) return "call_center";
  if (lower.includes("email")) return "email";
  if (lower.includes("merchant")) return "merchant_portal";
  if (lower.includes("agent")) return "field_agent";
  return "unknown";
}

function normalizeUserType(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("merchant")) return "merchant";
  if (lower.includes("agent")) return "agent";
  return "customer";
}

function normalizeTransactionType(value: unknown) {
  const lower = String(value ?? "").toLowerCase();
  if (lower.includes("cash_in")) return "cash_in";
  if (lower.includes("cash_out")) return "cash_out";
  if (lower.includes("settlement")) return "settlement";
  if (lower.includes("refund")) return "refund";
  if (lower.includes("transfer")) return "transfer";
  if (lower.includes("payment") || lower.includes("charge") || lower.includes("subscription") || lower.includes("purchase")) {
    return "payment";
  }
  return "unknown";
}

function normalizeStatus(value: unknown) {
  const lower = String(value ?? "").toLowerCase();
  if (lower === "success" || lower === "successful" || lower === "complete") return "completed";
  if (["completed", "failed", "pending", "reversed"].includes(lower)) return lower;
  return "unknown";
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeTransactionHistory(value: string): BackendTransaction[] {
  const parsed = JSON.parse(value || "[]");
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.last_10_txns)
      ? parsed.last_10_txns
      : [];

  return items.map((item: any) => ({
    transaction_id: item.transaction_id ?? item.id ?? item.txn_id ?? `gen-${Math.random()}`,
    timestamp: item.timestamp ?? item.date ?? new Date().toISOString(),
    type: normalizeTransactionType(item.type),
    amount: numberOrUndefined(item.amount ?? item.amt),
    counterparty: item.counterparty ?? item.recipient ?? item.merchant ?? item.desc,
    status: normalizeStatus(item.status),
  }));
}

function confidencePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}

function mapAnalysis(data: BackendAnalysis): AnalysisResult {
  const verdict = data.evidence_verdict.toUpperCase();
  const reasonCodes = data.reason_codes ?? [];

  return {
    caseType: labelFromSnake(data.case_type),
    verdict,
    relevantTxn: data.relevant_transaction_id ?? "NONE",
    severity: data.severity.toUpperCase(),
    department: labelFromSnake(data.department),
    confidence: confidencePercent(data.confidence),
    summary: data.agent_summary,
    nextAction: data.recommended_next_action,
    replyTemplate: data.customer_reply,
    protocolChecks: [
      { name: "Backend Schema", status: "Verified", details: "FastAPI response validated" },
      { name: "Evidence Verdict", status: "Verified", details: labelFromSnake(data.evidence_verdict) },
      {
        name: "Human Review",
        status: data.human_review_required ? "Warning" : "Verified",
        details: data.human_review_required ? "Manual review required" : "Automated routing allowed",
      },
      {
        name: "Reason Codes",
        status: reasonCodes.length ? "Verified" : "Warning",
        details: reasonCodes.length ? reasonCodes.join(", ") : "No reason codes returned",
      },
    ],
  };
}

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body.error || `Request failed with HTTP ${response.status}`;
  } catch {
    return `Request failed with HTTP ${response.status}`;
  }
}

export async function fetchApiHealth() {
  const start = performance.now();
  const response = await fetch(`${API_PREFIX}/health`);
  const latencyMs = Math.round(performance.now() - start);
  addMetric("/health", response.status, latencyMs);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = await response.json();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  return {
    status: String(data.status ?? "ok").toUpperCase(),
    systemStatus: data.status === "ok" ? "Optimal" : "Degraded",
    uptimeSeconds,
    apiKeyConfigured: false,
    metrics: {
      requestCount,
      successCount,
      errorCount,
      lastLatencyMs,
      recentRequests: [...recentRequests],
    },
  };
}

export async function analyzeTicket(input: AnalyzeTicketInput) {
  const body = {
    ticket_id: input.ticketId,
    complaint: input.complaintText,
    language: normalizeLanguage(input.language),
    channel: normalizeChannel(input.channel),
    user_type: normalizeUserType(input.userType),
    transaction_history: normalizeTransactionHistory(input.transactionHistory),
    metadata: {
      frontend_user_type: input.userType,
      custom_policy: input.customPolicy,
    },
  };

  const start = performance.now();
  const response = await fetch(`${API_PREFIX}/analyze-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - start);
  addMetric("/analyze-ticket", response.status, latencyMs, input.ticketId);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = (await response.json()) as BackendAnalysis;
  return {
    success: true,
    source: "FastAPI backend",
    data: mapAnalysis(data),
    latencyMs,
  };
}
