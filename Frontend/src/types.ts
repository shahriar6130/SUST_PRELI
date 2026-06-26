export interface ProtocolCheck {
  name: string;
  status: "Verified" | "Failed" | "Warning" | string;
  details: string;
}

export interface AnalysisResult {
  caseType: string;
  verdict: "CONSISTENT" | "INCONSISTENT" | "SUSPICIOUS" | "ESCALATED" | string;
  relevantTxn: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  department: string;
  confidence: number;
  summary: string;
  nextAction: string;
  replyTemplate: string;
  protocolChecks: ProtocolCheck[];
}

export interface Ticket {
  id: string;
  userType: "Premium Tier" | "Standard Tier" | "VIP" | "Enterprise" | string;
  complaintText: string;
  language: string;
  channel: string;
  transactionHistory: string; // JSON string
  createdAt: string;
  analysis?: AnalysisResult;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
  type: "info" | "success" | "warning" | "error";
}

export interface ApiRequestMetric {
  timestamp: string;
  endpoint: string;
  status: number;
  latencyMs: number;
  ticketId?: string;
}
