import { Ticket } from "../types";

export const DEFAULT_POLICIES = `STANDARD DISPUTE PROTOCOLS:
1. MATCH TRANSACTION: Scan the customer's transaction history for any transaction matching the stated amount (or close to it) and timing described.
2. EVIDENCE VERDICT:
   - "CONSISTENT": If a single transaction matches the exact amount, date range, and recipient characteristics.
   - "INCONSISTENT": If no matching transactions exist, or if the transaction details directly contradict the customer's claims.
   - "SUSPICIOUS": If multiple transactions match, or if there is active flagged activity (e.g., login from dynamic IPs).
   - "ESCALATED": If account compromise or fraud is explicitly suspected.
3. SEVERITY LEVEL:
   - LOW: Amounts < $50, minor billing questions.
   - MEDIUM: Amounts $50 - $200, technical delay issues.
   - HIGH: Amounts $200 - $1000, wire transfer errors, Premium/Enterprise accounts.
   - CRITICAL: Amounts > $1000, verified credential theft, account takeovers.
4. DEPARTMENT MAPPING:
   - "Dispute Res." for transfer errors, incorrect recipients, and refund delays.
   - "Fraud Ops" for unauthorized access, phishing reports, and stolen cards.
   - "Billing Ops" for double charges, subscription cancellations, and invoice issues.
   - "Technical Support" for transfer delays, app errors, or interface issues.
5. COMPLIANCE CHECKLIST:
   - Do not request secure credentials (CVV, passwords, full credit card numbers, PIN).
   - Do not promise automated or immediate payouts; promise "diligent review" or "investigation".
   - Restrict support communications to verified official in-app channels.`;

export const PRESET_TICKETS: Ticket[] = [
  {
    id: "TKT-001",
    userType: "Premium Tier",
    complaintText: "I accidentally sent $450 to the wrong recipient account ending in 9101. The transaction happened 2 hours ago. I need a reversal immediately as this was for my rent.",
    language: "English (US)",
    channel: "In-App Chat",
    transactionHistory: JSON.stringify({
      last_10_txns: [
        { transaction_id: "TXN-9101", amount: 450.00, status: "completed", type: "transfer", timestamp: "2026-06-26T05:04:15-07:00", counterparty: "Friend" },
        { transaction_id: "TXN-8821", amount: 12.50, status: "completed", type: "payment", timestamp: "2026-06-25T09:00:00-07:00", counterparty: "Coffee Shop" },
        { transaction_id: "TXN-7612", amount: 120.00, status: "completed", type: "transfer", timestamp: "2026-06-23T12:00:00-07:00", counterparty: "Rent Reserve" }
      ],
      flagged_activity: false
    }, null, 2),
    createdAt: "2026-06-26T07:04:15-07:00",
    analysis: {
      caseType: "Wrong Transfer",
      verdict: "CONSISTENT",
      relevantTxn: "TXN-9101",
      severity: "HIGH",
      department: "Dispute Res.",
      confidence: 90,
      summary: "User reported a transaction error 2 hours post-event. System identified TXN-9101 ($450.00) matching the description precisely. Recipient account is marked as a frequent contact, but the amount is unusual for this time of month. User has a \"Premium Tier\" history with zero previous dispute claims, increasing credibility score.",
      nextAction: "Initiate standard \"Wrong Recipient\" workflow. Request user confirmation of the target IBAN before triggering internal clearing reversal.",
      replyTemplate: "Hello, we have received your request regarding ticket TKT-001. We have identified transaction TXN-9101 for $450.00. Our Dispute Resolution team is currently reviewing the reversal possibility. Could you please confirm the last 4 digits of the recipient's account you intended to send to? We will provide an update within 4 hours.",
      protocolChecks: [
        { name: "Schema Valid", status: "Verified", details: "0.02ms" },
        { name: "No Credential Request", status: "Verified", details: "Verified" },
        { name: "No Refund Promise", status: "Verified", details: "Verified" },
        { name: "Official Channels Only", status: "Verified", details: "Verified" }
      ]
    }
  },
  {
    id: "TKT-002",
    userType: "Standard Tier",
    complaintText: "Help! There is an unauthorized charge of $120.00 from a merchant named 'GadgetGalaxy' on my card yesterday. I never made this purchase. Please block my card!",
    language: "English (US)",
    channel: "Email",
    transactionHistory: JSON.stringify({
      last_10_txns: [
        { transaction_id: "TXN-3012", amount: 120.00, status: "completed", type: "payment", timestamp: "2026-06-25T14:00:00-07:00", counterparty: "GadgetGalaxy Online" },
        { transaction_id: "TXN-2911", amount: 45.30, status: "completed", type: "payment", timestamp: "2026-06-23T18:30:00-07:00", counterparty: "Gas Station" }
      ],
      flagged_activity: true,
      last_login: "IP: 198.162.4.9 (Suspicious Range)"
    }, null, 2),
    createdAt: "2026-06-25T14:20:00-07:00",
    analysis: {
      caseType: "Fraud Dispute",
      verdict: "SUSPICIOUS",
      relevantTxn: "TXN-3012",
      severity: "CRITICAL",
      department: "Fraud Ops",
      confidence: 95,
      summary: "Customer disputes a $120.00 credit card transaction at GadgetGalaxy. System flagged a login mismatch from an unusual IP range occurring at the same hour. High suspicion of unauthorized checkout. Standard Tier history contains steady localized purchases, making this digital purchase highly anomalous.",
      nextAction: "Freeze transaction card immediately. Initiate fraud recovery flow and request customer security confirmation.",
      replyTemplate: "Hello, we take your account security very seriously. We have temporarily frozen your credit card to prevent further unauthorized charges. We are investigating transaction TXN-3012 for $120.00 at GadgetGalaxy. Could you please review your recent sign-ins and confirm if you recognize the activity? We will follow up with fraud claim details soon.",
      protocolChecks: [
        { name: "Schema Valid", status: "Verified", details: "0.05ms" },
        { name: "No Credential Request", status: "Verified", details: "Verified" },
        { name: "No Refund Promise", status: "Verified", details: "Verified" },
        { name: "Official Channels Only", status: "Verified", details: "Verified" }
      ]
    }
  },
  {
    id: "TKT-003",
    userType: "VIP",
    complaintText: "I was double charged for my monthly subscription! It took $29.99 twice out of my account yesterday. Please give me my money back.",
    language: "English (US)",
    channel: "In-App Chat",
    transactionHistory: JSON.stringify({
      last_10_txns: [
        { transaction_id: "TXN-4112", amount: 29.99, status: "completed", type: "payment", timestamp: "2026-06-25T05:10:00-07:00", counterparty: "SaaS Monthly Sub" },
        { transaction_id: "TXN-4113", amount: 29.99, status: "completed", type: "payment", timestamp: "2026-06-25T05:10:01-07:00", counterparty: "SaaS Monthly Sub" },
        { transaction_id: "TXN-4001", amount: 1500.00, status: "completed", type: "transfer", timestamp: "2026-06-21T11:00:00-07:00", counterparty: "Corporate Payout" }
      ],
      flagged_activity: false
    }, null, 2),
    createdAt: "2026-06-26T05:12:00-07:00",
    analysis: {
      caseType: "Double Charge",
      verdict: "CONSISTENT",
      relevantTxn: "TXN-4113",
      severity: "MEDIUM",
      department: "Billing Ops",
      confidence: 98,
      summary: "The customer was charged $29.99 twice under adjacent transaction IDs TXN-4112 and TXN-4113 within a 1-second interval. This represents a classic server duplicate post-request issue. Customer has VIP status, and their profile shows long-term loyalty.",
      nextAction: "Approve refund of the duplicate transaction TXN-4113 immediately under self-service Billing resolution policies.",
      replyTemplate: "Hello, we sincerely apologize for the inconvenience. We have verified that a duplicate charge of $29.99 occurred yesterday due to a technical handshake glitch (TXN-4113). Our Billing team has approved a full reversal for this second charge. You should see the funds return to your balance within 1-2 business days.",
      protocolChecks: [
        { name: "Schema Valid", status: "Verified", details: "0.01ms" },
        { name: "No Credential Request", status: "Verified", details: "Verified" },
        { name: "No Refund Promise", status: "Verified", details: "Verified" },
        { name: "Official Channels Only", status: "Verified", details: "Verified" }
      ]
    }
  }
];
