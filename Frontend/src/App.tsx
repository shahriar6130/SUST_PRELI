import React, { useState, useEffect } from "react";
import { 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  CheckSquare, 
  ChevronRight, 
  ClipboardList, 
  Code, 
  CornerDownLeft, 
  Edit, 
  FileCode, 
  FileSearch, 
  FileText, 
  HelpCircle, 
  Info, 
  LayoutDashboard, 
  Lightbulb, 
  Loader2, 
  Play, 
  RefreshCw, 
  Save, 
  Send, 
  ShieldCheck, 
  Terminal, 
  User, 
  Check, 
  AlertTriangle,
  Flame,
  UserCheck,
  Cpu,
  Globe
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import { analyzeTicket, fetchApiHealth } from "./api";
import { PRESET_TICKETS, DEFAULT_POLICIES } from "./data/templates";
import { Ticket, AnalysisResult, AuditLogEntry } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [tickets, setTickets] = useState<Ticket[]>(PRESET_TICKETS);
  const [selectedTicketId, setSelectedTicketId] = useState<string>("TKT-001");
  
  // Active Form State (loaded from selected ticket)
  const [formTicketId, setFormTicketId] = useState("");
  const [formUserType, setFormUserType] = useState("Premium Tier");
  const [formComplaintText, setFormComplaintText] = useState("");
  const [formLanguage, setFormLanguage] = useState("English (US)");
  const [formChannel, setFormChannel] = useState("In-App Chat");
  const [formTxHistory, setFormTxHistory] = useState("");
  
  // Custom compliance policies from the Policy Editor
  const [customPolicy, setCustomPolicy] = useState(DEFAULT_POLICIES);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [isEditingReply, setIsEditingReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  
  // API Health State
  const [apiHealth, setApiHealth] = useState<any>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [apiReachable, setApiReachable] = useState(false);
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: "LOG-100",
      timestamp: new Date(Date.now() - 3600000 * 2).toLocaleTimeString(),
      user: "System Daemon",
      action: "Initialization",
      details: "QueueStorm Engine v4.2 fully booted. Fallback matching rules compiled.",
      type: "info"
    },
    {
      id: "LOG-101",
      timestamp: new Date(Date.now() - 3600000).toLocaleTimeString(),
      user: "Agent_421",
      action: "Authenticate",
      details: "Agent workspace session established on secure endpoint.",
      type: "success"
    },
    {
      id: "LOG-102",
      timestamp: new Date(Date.now() - 1800000).toLocaleTimeString(),
      user: "System Daemon",
      action: "Compliance Audit",
      details: "Standard Dispute Protocols parsed successfully. 4/4 assertions validated.",
      type: "success"
    }
  ]);

  // Load ticket details into form when selection changes
  useEffect(() => {
    const ticket = tickets.find(t => t.id === selectedTicketId);
    if (ticket) {
      setFormTicketId(ticket.id);
      setFormUserType(ticket.userType);
      setFormComplaintText(ticket.complaintText);
      setFormLanguage(ticket.language);
      setFormChannel(ticket.channel);
      setFormTxHistory(ticket.transactionHistory);
      setCurrentAnalysis(ticket.analysis || null);
      setReplyText(ticket.analysis?.replyTemplate || "");
      setIsEditingReply(false);
    }
  }, [selectedTicketId, tickets]);

  // Fetch API Health data
  const fetchHealth = async () => {
    setIsHealthLoading(true);
    try {
      const data = await fetchApiHealth();
      setApiHealth(data);
      setApiReachable(true);
    } catch (e) {
      console.error("Failed to fetch health data", e);
      setApiReachable(false);
    } finally {
      setIsHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Show auto-dismissing toast
  const triggerToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Add an entry to the Audit Log
  const addAuditLog = (action: string, details: string, type: "success" | "info" | "warning" | "error" = "info") => {
    const newLog: AuditLogEntry = {
      id: `LOG-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toLocaleTimeString(),
      user: "Agent_421",
      action,
      details,
      type
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  // Submit and analyze a ticket via server route
  const handleAnalyzeTicket = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsAnalyzing(true);
    
    addAuditLog("Analysis Triggered", `Initiating evaluation on Ticket ID: ${formTicketId}`, "info");

    try {
      // Validate JSON history format
      try {
        JSON.parse(formTxHistory);
      } catch (err) {
        triggerToast("Invalid Transaction History JSON format", "error");
        setIsAnalyzing(false);
        addAuditLog("Analysis Failed", `Invalid JSON syntax in Ticket ID ${formTicketId}`, "error");
        return;
      }

      const result = await analyzeTicket({
        ticketId: formTicketId,
        userType: formUserType,
        complaintText: formComplaintText,
        language: formLanguage,
        channel: formChannel,
        transactionHistory: formTxHistory,
        customPolicy: customPolicy
      });
      if (result.success && result.data) {
        const newAnalysis: AnalysisResult = result.data;
        setCurrentAnalysis(newAnalysis);
        setReplyText(newAnalysis.replyTemplate);
        
        // Update tickets collection state with latest analysis
        setTickets(prev => prev.map(t => {
          if (t.id === selectedTicketId) {
            return {
              ...t,
              id: formTicketId,
              userType: formUserType,
              complaintText: formComplaintText,
              language: formLanguage,
              channel: formChannel,
              transactionHistory: formTxHistory,
              analysis: newAnalysis
            };
          }
          return t;
        }));

        triggerToast(`Ticket ${formTicketId} analyzed successfully!`, "success");
        addAuditLog("Analysis Completed", `Evaluation finished. Verdict: ${newAnalysis.verdict} (${result.source})`, "success");
        
        // Refresh API Health values
        fetchHealth();
      } else {
        throw new Error(result.error || "Failed parsing analytical verdict");
      }
    } catch (error: any) {
      console.error(error);
      triggerToast(error.message || "Endpoint error", "error");
      addAuditLog("Analysis Error", error.message || "General operational malfunction", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Preset Selection Loader
  const handleLoadPreset = (id: string) => {
    setSelectedTicketId(id);
    triggerToast(`Loaded Case File: ${id}`, "info");
    addAuditLog("Case File Loaded", `Active focus shifted to preset: ${id}`, "info");
  };

  // Handle manual editing of the customer reply preview
  const handleSaveReplyEdit = () => {
    setIsEditingReply(false);
    if (currentAnalysis) {
      const updatedAnalysis = { ...currentAnalysis, replyTemplate: replyText };
      setCurrentAnalysis(updatedAnalysis);
      setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, analysis: updatedAnalysis } : t));
    }
    triggerToast("Customer Reply template updated", "success");
    addAuditLog("Reply Modified", `In-place text adjustments saved for Ticket ID: ${formTicketId}`, "info");
  };

  // Transmit Response
  const handleTransmitResponse = () => {
    triggerToast(`Response securely transmitted to ${formChannel}`, "success");
    addAuditLog("Response Transmitted", `Case resolved. Secure message dispatched via ${formChannel}.`, "success");
  };

  // Custom compliance checklist states
  const [safetyChecks, setSafetyChecks] = useState([
    { id: "audit-1", label: "Verify identity validation triggers match system hardware bounds", checked: true },
    { id: "audit-2", label: "Assert zero core password references in outbound messages", checked: true },
    { id: "audit-3", label: "Confirm transactional ledger matches the customer account statement", checked: true },
    { id: "audit-4", label: "Authenticate source communication channel payload", checked: false },
    { id: "audit-5", label: "Inspect recipient IBAN for fraud record tags", checked: false }
  ]);

  const toggleSafetyCheck = (id: string) => {
    setSafetyChecks(prev => prev.map(c => c.id === id ? { ...c, checked: !c.checked } : c));
    addAuditLog("Checklist Audited", `Safety asset changed state`, "info");
  };

  // Help seed synthetic background metrics
  const triggerSyntheticTraffic = async () => {
    triggerToast("Sending verification handshake...", "info");
    try {
      await fetchApiHealth();
      await analyzeTicket({
        ticketId: "PING-TEST",
        userType: "Standard Tier",
        complaintText: "System health check handshake test parameters",
        language: "English (US)",
        channel: "In-App Chat",
        transactionHistory: "[]",
        customPolicy,
      });
      fetchHealth();
      triggerToast("API metrics updated!", "success");
      addAuditLog("Traffic Simulated", "Background performance diagnostics completed.", "success");
    } catch (e) {
      triggerToast("Diagnostics handshake failed", "error");
    }
  };

  return (
    <div className="flex h-screen bg-[#f8f9fa] text-[#191c1d] overflow-hidden font-sans">
      {/* Toast Notification Container */}
      {toast && (
        <div 
          id="toast-notification"
          className={`fixed top-4 right-4 z-50 flex items-center space-x-3 px-4 py-3 rounded-lg shadow-lg border text-sm transition-all duration-300 animate-slide-in ${
            toast.type === "success" 
              ? "bg-green-50 border-green-200 text-green-800" 
              : toast.type === "error" 
              ? "bg-red-50 border-red-200 text-red-800" 
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          {toast.type === "success" && <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />}
          {toast.type === "error" && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
          {toast.type === "info" && <Info className="w-5 h-5 text-blue-600 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header id="top-navbar" className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-blue-700 tracking-tight font-sans">
              QueueStorm Investigator
            </h1>
            <div className="flex items-center space-x-2">
              <span className={`flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border font-sans ${
                apiReachable
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${
                  apiReachable ? "bg-green-500 animate-pulse" : "bg-amber-500"
                }`}></span>
                API Health: {apiReachable ? "OK" : isHealthLoading ? "Checking" : "Offline"}
              </span>
              <span className="flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 font-sans">
                <Cpu className="w-3.5 h-3.5 mr-1 text-blue-500" />
                System Status: {apiHealth?.systemStatus || "Waiting"}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Quick Case Switcher Dropdown in the header */}
            <div className="flex items-center space-x-2 border-r pr-4 border-gray-200">
              <span className="text-xs text-gray-500 font-mono">CASE FILE:</span>
              <select
                id="case-switcher-select"
                value={selectedTicketId}
                onChange={(e) => handleLoadPreset(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-xs font-mono rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {tickets.map(t => (
                  <option key={t.id} value={t.id}>{t.id} ({t.userType})</option>
                ))}
              </select>
            </div>

            <button 
              id="top-action-refresh"
              onClick={() => {
                fetchHealth();
                triggerToast("System metrics updated", "info");
              }} 
              className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh Health"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button 
              id="top-action-policy"
              onClick={() => setActiveTab("policies")}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
              title="Custom Guidelines"
            >
              <FileCode className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-sm font-medium text-gray-700">
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-mono">
                421
              </div>
              <span className="text-xs font-mono text-gray-600">Agent_421</span>
            </div>
          </div>
        </header>

        {/* Scrollable View Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#f8f9fa]">
          
          {/* TAB 1: DASHBOARD (MAIN COMPLAINT ANALYZER WORKSPACE) */}
          {activeTab === "dashboard" && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              
              {/* Active Ticket Notification / Selection Aid Bar */}
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>Currently evaluating case file <strong>{selectedTicketId}</strong> under standard resolution guidelines.</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">Switch Preset:</span>
                  <div className="flex space-x-1">
                    {tickets.map(t => (
                      <button
                        key={t.id}
                        id={`btn-preset-load-${t.id}`}
                        onClick={() => handleLoadPreset(t.id)}
                        className={`px-2.5 py-1 text-xs font-mono rounded border transition-all ${
                          selectedTicketId === t.id
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
                        }`}
                      >
                        {t.id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid split: Case Meta Sidebar / Content Area / Verdict Area */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Column 1: Manual Entry / Ticket Parameters (5 Columns) */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* Manual Entry Form Card */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-3 flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wider font-sans">
                        Analyze New Ticket
                      </h3>
                      <span className="text-[10px] font-mono text-gray-400 uppercase font-medium tracking-widest">
                        Manual Entry
                      </span>
                    </div>

                    <form onSubmit={handleAnalyzeTicket} className="p-4 space-y-4 flex-1">
                      {/* Ticket ID & User Type */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1 font-sans">Ticket ID</label>
                          <input
                            type="text"
                            id="input-ticket-id"
                            value={formTicketId}
                            onChange={(e) => setFormTicketId(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded px-3 py-1.5 text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1 font-sans">User Type</label>
                          <select
                            id="select-user-type"
                            value={formUserType}
                            onChange={(e) => setFormUserType(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="Premium Tier">Premium Tier</option>
                            <option value="Standard Tier">Standard Tier</option>
                            <option value="VIP">VIP</option>
                            <option value="Enterprise">Enterprise</option>
                          </select>
                        </div>
                      </div>

                      {/* Complaint Text */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1 font-sans">Complaint Text</label>
                        <textarea
                          id="textarea-complaint"
                          value={formComplaintText}
                          onChange={(e) => setFormComplaintText(e.target.value)}
                          rows={4}
                          className="w-full bg-white border border-gray-200 rounded p-3 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-sans"
                          placeholder="Type customer's exact message here..."
                          required
                        />
                      </div>

                      {/* Language & Channel */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1 font-sans">Language</label>
                          <select
                            id="select-language"
                            value={formLanguage}
                            onChange={(e) => setFormLanguage(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="English (US)">English (US)</option>
                            <option value="English (UK)">English (UK)</option>
                            <option value="Spanish (ES)">Spanish (ES)</option>
                            <option value="German (DE)">German (DE)</option>
                            <option value="Bangla (BD)">Bangla (BD)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1 font-sans">Channel</label>
                          <select
                            id="select-channel"
                            value={formChannel}
                            onChange={(e) => setFormChannel(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="In-App Chat">In-App Chat</option>
                            <option value="Email">Email</option>
                            <option value="Secure Message">Secure Message</option>
                            <option value="SMS Gateway">SMS Gateway</option>
                          </select>
                        </div>
                      </div>

                      {/* Transaction History JSON */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1 font-sans">Transaction History (JSON)</label>
                        <textarea
                          id="textarea-tx-history"
                          value={formTxHistory}
                          onChange={(e) => setFormTxHistory(e.target.value)}
                          rows={6}
                          className="w-full bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          placeholder='{ "last_10_txns": [] }'
                          required
                        />
                      </div>

                      {/* Action Trigger Button */}
                      <button
                        type="submit"
                        id="btn-analyze-ticket"
                        disabled={isAnalyzing}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded text-xs transition-colors flex items-center justify-center space-x-2 shadow-sm font-sans"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Computing Analytical Model...</span>
                          </>
                        ) : (
                          <>
                            <Activity className="w-4 h-4 text-white" />
                            <span>Analyze Ticket</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Protocol Validation Checklist Card */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                      Protocol Validation
                    </h4>
                    
                    <div id="protocol-validation-list" className="space-y-2">
                      {currentAnalysis?.protocolChecks ? (
                        currentAnalysis.protocolChecks.map((check, index) => (
                          <div 
                            key={index}
                            className="flex items-center justify-between p-2 bg-[#f8f9fa] rounded border border-gray-100 text-xs"
                          >
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                              <span className="font-sans font-medium text-gray-700">{check.name}</span>
                            </div>
                            <span className="font-mono text-[10px] text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                              {check.details}
                            </span>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="flex items-center justify-between p-2 bg-[#f8f9fa] rounded border border-gray-100 text-xs">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                              <span className="font-sans font-medium text-gray-700">Schema Valid</span>
                            </div>
                            <span className="font-mono text-[10px] text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded">0.02ms</span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-[#f8f9fa] rounded border border-gray-100 text-xs">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                              <span className="font-sans font-medium text-gray-700">No Credential Request</span>
                            </div>
                            <span className="font-mono text-[10px] text-green-500 bg-green-50/50 border border-green-100 px-1.5 py-0.5 rounded">Verified</span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-[#f8f9fa] rounded border border-gray-100 text-xs">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                              <span className="font-sans font-medium text-gray-700">No Refund Promise</span>
                            </div>
                            <span className="font-mono text-[10px] text-green-500 bg-green-50/50 border border-green-100 px-1.5 py-0.5 rounded">Verified</span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-[#f8f9fa] rounded border border-gray-100 text-xs">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                              <span className="font-sans font-medium text-gray-700">Official Channels Only</span>
                            </div>
                            <span className="font-mono text-[10px] text-green-500 bg-green-50/50 border border-green-100 px-1.5 py-0.5 rounded">Verified</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                </div>

                {/* Column 2: Analysis Results & Draft Response (7 Columns) */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* Results Heading Bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <h2 className="text-lg font-bold text-gray-800 font-sans">
                        Analysis Results
                      </h2>
                      {currentAnalysis?.verdict && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase font-sans border ${
                          currentAnalysis.verdict === "CONSISTENT"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : currentAnalysis.verdict === "SUSPICIOUS"
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                          {currentAnalysis.verdict}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 font-mono">Case: {formTicketId}</span>
                  </div>

                  {/* Metagrid: 6 metrics parameters cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {/* Case Type */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Case Type</span>
                      <p id="metric-case-type" className="text-sm font-semibold text-gray-800">
                        {currentAnalysis?.caseType || "Wrong Transfer"}
                      </p>
                    </div>

                    {/* Evidence Verdict */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Evidence Verdict</span>
                      <div className="flex items-center space-x-1.5 text-sm font-semibold text-green-600">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span id="metric-verdict">{currentAnalysis?.verdict || "Consistent"}</span>
                      </div>
                    </div>

                    {/* Relevant Txn */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Relevant Txn</span>
                      <p id="metric-relevant-txn" className="text-sm font-semibold text-blue-600 font-mono">
                        {currentAnalysis?.relevantTxn || "TXN-9101"}
                      </p>
                    </div>

                    {/* Severity Card with border-left accent */}
                    <div className="bg-white p-4 rounded-lg border-y border-r border-l-4 border-gray-200 border-l-orange-500 shadow-sm space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Severity</span>
                      <p id="metric-severity" className="text-sm font-bold text-orange-600 font-mono">
                        {currentAnalysis?.severity || "HIGH"}
                      </p>
                    </div>

                    {/* Department */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Department</span>
                      <p id="metric-department" className="text-sm font-semibold text-gray-800">
                        {currentAnalysis?.department || "Dispute Res."}
                      </p>
                    </div>

                    {/* Confidence */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-1 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Confidence</span>
                        <p id="metric-confidence" className="text-sm font-bold text-gray-800">
                          {currentAnalysis?.confidence || "90"}%
                        </p>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-green-500 h-1.5 rounded-full" 
                          style={{ width: `${currentAnalysis?.confidence || 90}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* RATIONAL SUMMARY Block */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-3 flex items-center space-x-2">
                      <ClipboardList className="w-4 h-4 text-gray-500" />
                      <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">
                        Rational Summary
                      </h3>
                    </div>
                    <div className="p-4 space-y-4 text-xs leading-relaxed text-gray-600 font-sans">
                      <p id="analysis-summary-text">
                        {currentAnalysis?.summary || "User reported a transaction error 2 hours post-event. System identified TXN-9101 ($450.00) matching the description precisely. Recipient account is marked as a frequent contact, but the amount is unusual for this time of month. User has a \"Premium Tier\" history with zero previous dispute claims, increasing credibility score."}
                      </p>

                      {/* Recommended Next Action */}
                      <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3.5 space-y-2">
                        <div className="flex items-center space-x-2 text-blue-700 font-bold font-sans">
                          <Lightbulb className="w-4 h-4 text-blue-600" />
                          <span>Recommended Next Action</span>
                        </div>
                        <p id="analysis-next-action-text" className="text-gray-700 text-xs">
                          {currentAnalysis?.nextAction || "Initiate standard \"Wrong Recipient\" workflow. Request user confirmation of the target IBAN before triggering internal clearing reversal."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Customer Reply Preview Card */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-800 font-sans">
                        Customer Reply Preview
                      </h3>
                      <span className="flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100 font-sans">
                        <ShieldCheck className="w-3.5 h-3.5 mr-1 text-blue-500" />
                        Safe Reply
                      </span>
                    </div>

                    <div className="p-4 space-y-4">
                      {isEditingReply ? (
                        <textarea
                          id="textarea-edit-reply"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          rows={6}
                          className="w-full bg-white border border-blue-200 focus:outline-none focus:ring-1 focus:ring-blue-500 p-3 rounded text-xs text-gray-700 font-sans font-medium"
                        />
                      ) : (
                        <div className="bg-gray-50/50 border border-gray-100 rounded p-4 text-xs text-gray-700 font-sans italic leading-relaxed whitespace-pre-line">
                          {replyText || "Compute a transaction analysis to generate safe customer resolution replies..."}
                        </div>
                      )}

                      <div className="flex items-center justify-end space-x-3">
                        {isEditingReply ? (
                          <>
                            <button
                              id="btn-cancel-reply"
                              onClick={() => {
                                setReplyText(currentAnalysis?.replyTemplate || "");
                                setIsEditingReply(false);
                              }}
                              className="px-3 py-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 transition-colors font-sans"
                            >
                              Cancel
                            </button>
                            <button
                              id="btn-save-reply"
                              onClick={handleSaveReplyEdit}
                              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-xs transition-colors flex items-center space-x-1.5 font-sans"
                            >
                              <Save className="w-3.5 h-3.5 text-white" />
                              <span>Save Changes</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              id="btn-edit-reply"
                              onClick={() => setIsEditingReply(true)}
                              className="px-3.5 py-2 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors flex items-center space-x-1.5 font-sans"
                            >
                              <Edit className="w-3.5 h-3.5 text-gray-400" />
                              <span>Edit Content</span>
                            </button>
                            <button
                              id="btn-transmit-reply"
                              onClick={handleTransmitResponse}
                              disabled={!replyText}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded text-xs transition-colors flex items-center space-x-1.5 shadow-sm font-sans"
                            >
                              <Send className="w-3.5 h-3.5 text-white" />
                              <span>Send to Customer</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

          {/* TAB 2: INVESTIGATIONS LIST */}
          {activeTab === "investigations" && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-800 font-sans">Active Investigations</h2>
                  <p className="text-xs text-gray-500 font-sans mt-0.5">Explore historic and active ticket evaluations inside your workspace.</p>
                </div>
                <button
                  id="btn-add-ticket"
                  onClick={() => {
                    const newId = `TKT-${Math.floor(100 + Math.random() * 900)}`;
                    const blankTicket: Ticket = {
                      id: newId,
                      userType: "Standard Tier",
                      complaintText: "Unscheduled billing charge noticed on transaction card statement.",
                      language: "English (US)",
                      channel: "Email",
                      transactionHistory: JSON.stringify({
                        last_10_txns: [{ id: "TXN-7788", amt: 50.00, status: "success", type: "charge", date: "2 days ago", desc: "Software Inc" }]
                      }, null, 2),
                      createdAt: new Date().toISOString()
                    };
                    setTickets([blankTicket, ...tickets]);
                    setSelectedTicketId(newId);
                    setActiveTab("dashboard");
                    triggerToast(`Case file ${newId} initialized.`, "success");
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded text-xs font-medium transition-colors font-sans shadow-sm"
                >
                  Create New Blank Case
                </button>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-mono uppercase tracking-widest text-[10px]">
                      <th className="p-4 font-bold">Case ID</th>
                      <th className="p-4 font-bold">User Level</th>
                      <th className="p-4 font-bold">Channel</th>
                      <th className="p-4 font-bold">Verdict</th>
                      <th className="p-4 font-bold">Severity</th>
                      <th className="p-4 font-bold">Assigned unit</th>
                      <th className="p-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-mono font-bold text-gray-900">{t.id}</td>
                        <td className="p-4 text-gray-600 font-sans font-medium">{t.userType}</td>
                        <td className="p-4 text-gray-500 font-sans">{t.channel}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.analysis?.verdict === "CONSISTENT"
                              ? "bg-green-50 text-green-700 border border-green-100"
                              : t.analysis?.verdict === "SUSPICIOUS"
                              ? "bg-orange-50 text-orange-700 border border-orange-100"
                              : t.analysis?.verdict === "ESCALATED"
                              ? "bg-red-50 text-red-700 border border-red-100"
                              : "bg-gray-50 text-gray-500 border border-gray-100"
                          }`}>
                            {t.analysis?.verdict || "Unresolved"}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-medium">
                          <span className={`${
                            t.analysis?.severity === "CRITICAL" ? "text-red-600" :
                            t.analysis?.severity === "HIGH" ? "text-orange-600" :
                            t.analysis?.severity === "MEDIUM" ? "text-yellow-600" : "text-green-600"
                          }`}>
                            {t.analysis?.severity || "MEDIUM"}
                          </span>
                        </td>
                        <td className="p-4 text-gray-700 font-sans font-medium">{t.analysis?.department || "Unassigned"}</td>
                        <td className="p-4 text-right">
                          <button
                            id={`btn-load-case-${t.id}`}
                            onClick={() => {
                              setSelectedTicketId(t.id);
                              setActiveTab("dashboard");
                            }}
                            className="bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-[11px] font-medium px-2.5 py-1 rounded transition-colors inline-flex items-center space-x-1"
                          >
                            <span>Load Workspace</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: API HEALTH & METRICS */}
          {activeTab === "health" && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-800 font-sans">API Diagnostics</h2>
                  <p className="text-xs text-gray-500 font-sans mt-0.5">Real-time metrics & pipeline diagnostics compiled directly from our back-end container services.</p>
                </div>
                <div className="flex space-x-3">
                  <button
                    id="btn-trigger-synthetic"
                    onClick={triggerSyntheticTraffic}
                    className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-3.5 py-2 rounded text-xs font-semibold transition-colors font-sans flex items-center space-x-1.5 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 text-gray-500" />
                    <span>Trigger Verification Traffic</span>
                  </button>
                  <button
                    id="btn-refresh-health"
                    onClick={fetchHealth}
                    disabled={isHealthLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded text-xs font-semibold transition-colors font-sans flex items-center space-x-1.5 shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-white ${isHealthLoading ? "animate-spin" : ""}`} />
                    <span>Synchronize Diagnostics</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Health Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Uptime State</span>
                  <p id="health-uptime" className="text-xl font-bold text-gray-800 font-mono">
                    {apiHealth?.uptimeSeconds ? `${apiHealth.uptimeSeconds}s` : "Online"}
                  </p>
                  <span className="text-xs text-green-600 font-medium">Container status normal</span>
                </div>

                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Total Requests processed</span>
                  <p id="health-requests" className="text-xl font-bold text-gray-800 font-mono">
                    {apiHealth?.metrics?.requestCount ?? 3}
                  </p>
                  <span className="text-xs text-gray-400">Ledger audit rate 100%</span>
                </div>

                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Average pipeline Latency</span>
                  <p id="health-latency" className="text-xl font-bold text-gray-800 font-mono">
                    {apiHealth?.metrics?.lastLatencyMs ? `${apiHealth.metrics.lastLatencyMs}ms` : "64ms"}
                  </p>
                  <span className="text-xs text-blue-600 font-medium">Lower than SLA limit (500ms)</span>
                </div>

                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">Gemini Integration</span>
                  <p id="health-api-status" className={`text-xl font-bold font-mono ${apiHealth?.apiKeyConfigured ? "text-green-600" : "text-amber-500"}`}>
                    {apiHealth?.apiKeyConfigured ? "ACTIVE" : "FALLBACK"}
                  </p>
                  <span className="text-[11px] text-gray-400">
                    {apiHealth?.apiKeyConfigured ? "Live LLM Engine" : "Local Analytical Engine"}
                  </span>
                </div>
              </div>

              {/* Diagnostics Logs Table */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest font-mono">Pipeline Requests Log</h3>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">Streaming Live</span>
                </div>
                <div className="p-4 text-xs font-mono">
                  {apiHealth?.metrics?.recentRequests?.length > 0 ? (
                    <div className="space-y-2">
                      {apiHealth.metrics.recentRequests.map((req: any, index: number) => (
                        <div key={index} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                          <div className="flex space-x-3">
                            <span className="text-gray-400">[{req.timestamp}]</span>
                            <span className="font-bold text-blue-600">POST {req.endpoint}</span>
                            <span className="text-gray-500">Case ID: {req.ticketId || "N/A"}</span>
                          </div>
                          <div className="flex space-x-4">
                            <span className={req.status === 200 ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                              HTTP {req.status}
                            </span>
                            <span className="text-gray-600 font-bold">{req.latencyMs}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-400 py-6">
                      No live requests evaluated yet. Click "Analyze Ticket" on the Dashboard to start collecting statistics.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: POLICY EDITOR */}
          {activeTab === "policies" && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800 font-sans">Policy Editor</h2>
                <p className="text-xs text-gray-500 font-sans mt-0.5">Customize specific compliance constraints and protocols used by our automated pipeline matching.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Rules Editor Box (Left 2 columns) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-[550px] overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Terminal className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest font-mono">Dispute Resolution Policy Directives</span>
                      </div>
                      <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-mono">Markdown Format</span>
                    </div>

                    <textarea
                      id="policy-editor-text"
                      value={customPolicy}
                      onChange={(e) => setCustomPolicy(e.target.value)}
                      className="flex-1 w-full p-4 bg-[#1e293b] text-slate-100 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                    />

                    <div className="bg-gray-50 border-t border-gray-100 p-4 flex justify-between items-center">
                      <button
                        id="btn-reset-policy"
                        onClick={() => {
                          setCustomPolicy(DEFAULT_POLICIES);
                          triggerToast("Compliance policies reset to factory parameters", "info");
                          addAuditLog("Policies Reset", "Core dispute constraints reverted to standard v4.2 parameters", "warning");
                        }}
                        className="px-3 py-1.5 border border-gray-200 text-gray-500 hover:bg-gray-100 rounded text-xs font-semibold transition-colors font-sans"
                      >
                        Reset Defaults
                      </button>
                      
                      <button
                        id="btn-save-policy"
                        onClick={() => {
                          triggerToast("Dispute policies saved to memory parameters", "success");
                          addAuditLog("Policies Saved", "Engine constraints updated dynamically.", "success");
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-xs font-semibold transition-colors font-sans shadow-sm"
                      >
                        Save Policy Parameters
                      </button>
                    </div>
                  </div>
                </div>

                {/* Instruction tips panel (Right column) */}
                <div className="space-y-4">
                  <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 font-sans">Prompt Protocol Tips</h3>
                    <p className="text-xs text-gray-500 leading-relaxed font-sans">
                      These policy guidelines are dynamically passed as strict system-level directives when evaluating with Gemini AI. You can inject custom brand requirements:
                    </p>
                    <ul className="space-y-2 text-xs text-gray-600 font-sans list-disc pl-4">
                      <li><strong>Force strict verification steps</strong> for wire transfers or billing refunds.</li>
                      <li><strong>Introduce custom response models</strong> for specific target segments (e.g., VIP, Enterprise).</li>
                      <li><strong>Establish validation rules</strong> for specific transactional formats.</li>
                    </ul>

                    <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-800 leading-relaxed font-sans flex space-x-2">
                      <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                      <span>Any updates to these rules will instantly modify downstream customer drafts and analytical checks upon the next ticket evaluation.</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === "logs" && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-800 font-sans">Audit Logs</h2>
                  <p className="text-xs text-gray-500 font-sans mt-0.5">Sequential ledger of all automated pipeline evaluations and agent decisions occurring inside the workspace.</p>
                </div>
                <button
                  id="btn-clear-logs"
                  onClick={() => {
                    setAuditLogs([]);
                    triggerToast("Audit Log ledger cleared", "info");
                  }}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 border border-red-100 hover:bg-red-50 bg-white px-3 py-1.5 rounded transition-all font-sans"
                >
                  Clear Logs
                </button>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-widest font-mono">
                  Active Activity Log Ledger
                </div>

                <div id="audit-logs-table" className="divide-y divide-gray-100">
                  {auditLogs.length > 0 ? (
                    auditLogs.map((log) => (
                      <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50/50 transition-all">
                        <div className="flex items-start space-x-3.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            log.type === "success" ? "bg-green-50 text-green-600" :
                            log.type === "warning" ? "bg-amber-50 text-amber-600" :
                            log.type === "error" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                          }`}>
                            <ClipboardList className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold font-mono text-gray-900 bg-gray-100 border px-1.5 py-0.5 rounded">
                                {log.id}
                              </span>
                              <span className="text-xs font-bold text-gray-800 font-sans">{log.action}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 font-sans">{log.details}</p>
                          </div>
                        </div>

                        <div className="mt-2 sm:mt-0 text-left sm:text-right text-[10px] font-mono text-gray-400 space-y-1">
                          <div className="text-gray-600 font-bold">BY: {log.user}</div>
                          <div>{log.timestamp}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-400 font-mono py-12 text-xs">
                      No logs collected in this session. Initialize some traffic or analyze a case file to collect audits.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SAFETY CHECKLIST */}
          {activeTab === "safety" && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800 font-sans">Safety Checklist</h2>
                <p className="text-xs text-gray-500 font-sans mt-0.5">Ensure all rigorous compliance requirements are verified before executing transactional reversions.</p>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4 max-w-2xl">
                <h3 className="text-sm font-bold text-gray-800 font-sans border-b pb-3 border-gray-100 flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-blue-500" />
                  <span>Interactive Case Audits</span>
                </h3>

                <div id="safety-checklist-options" className="space-y-3">
                  {safetyChecks.map((check) => (
                    <label
                      key={check.id}
                      className="flex items-start p-3 bg-gray-50 hover:bg-gray-100/70 rounded-lg border border-gray-200 cursor-pointer transition-colors text-xs select-none"
                    >
                      <input
                        type="checkbox"
                        checked={check.checked}
                        onChange={() => toggleSafetyCheck(check.id)}
                        className="mt-0.5 mr-3 w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-gray-700 font-medium font-sans">{check.label}</span>
                    </label>
                  ))}
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-800 leading-relaxed font-sans flex space-x-2.5">
                  <Info className="w-5 h-5 text-blue-500 shrink-0" />
                  <span>Checking off all elements indicates complete analytical consensus. The compliance audit log tracks checking status dynamically for regulatory oversight.</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: COMPLIANCE TAB */}
          {activeTab === "compliance" && (
            <div className="max-w-[1440px] mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800 font-sans">Regulatory Compliance</h2>
                <p className="text-xs text-gray-500 font-sans mt-0.5">Verify that automated responses align with consumer protection laws and internal guidelines.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-gray-800 font-sans border-b pb-2 border-gray-100">PCI-DSS Assertions</h3>
                  <p className="text-xs text-gray-500 leading-relaxed font-sans">
                    Never under any circumstance request or store authentication credentials. Outbound messages from our system pass static filtering checks ensuring absolute privacy.
                  </p>
                  <div className="bg-green-50 border border-green-100 rounded p-3 text-xs text-green-700 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Outbound filters currently ACTIVE and scanning draft replies.</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-gray-800 font-sans border-b pb-2 border-gray-100">Dispute Reversal Standards</h3>
                  <p className="text-xs text-gray-500 leading-relaxed font-sans">
                    Under standard protocol directives, instant reversals are restricted to verified VIP accounts or amounts below $50.00. High-severity wire transfers require direct agent confirmation.
                  </p>
                  <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-700 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Manual verification triggered on transactions above $200.00.</span>
                  </div>
                </div>

              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
