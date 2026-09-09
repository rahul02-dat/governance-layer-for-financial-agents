// Authoritative TypeScript interfaces for AgentGuard Governance Entities

export interface Permission {
  id: string;
  agent_id: string;
  action: string;
  resource_type: string;
  allowed_accounts?: string[] | null;
  allowed_currencies?: string[] | null;
  max_amount?: number | null;
  requires_approval_above?: number | null;
  enabled: boolean;
}

export interface Agent {
  id: string;
  name: string;
  owner: string;
  risk_tier: string;
  status: 'ACTIVE' | 'REVOKED';
  created_at: string;
  updated_at?: string | null;
  permissions?: Permission[];
}

export interface ApprovalRequest {
  id: string;
  agent_id: string;
  agent_name?: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
  created_at: string;
  parent_request_id?: string | null;
  decision_attempt?: number | null;
}

export interface AuditEvent {
  id: string;
  sequence_number?: number | null;
  timestamp: string;
  event_type: string;
  agent_id?: string | null;
  action?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  decision?: string | null;
  reason?: string | null;
  policy_id?: string | null;
  operator_id?: string | null;
  request_id?: string | null;
  authorization_id?: string | null;
  policy_version?: number | null;
  latency_ms?: number | null;
  previous_hash?: string | null;
  event_hash?: string | null;
}

export interface PaginatedAuditEvents {
  total: number;
  items: AuditEvent[];
}

export interface AuditVerifyResult {
  valid: boolean;
  message?: string;
  total_events?: number;
  head_hash?: string;
  error?: string;
  broken_event_id?: string;
  sequence_number?: number;
  expected_hash?: string;
  actual_hash?: string;
  expected_previous_hash?: string;
  actual_previous_hash?: string;
}

export interface PolicyVersion {
  id: string;
  policy_id: string;
  version_number: number;
  rego_content: string;
  content_hash: string;
  created_at: string;
}

export interface Policy {
  id: string;
  name: string;
  enabled: boolean;
  rego_content?: string | null;
  version_number?: number | null;
  content_hash?: string | null;
  created_at: string;
  updated_at?: string | null;
  versions?: PolicyVersion[];
}

export interface FleetStatusResponse {
  fleet_state: 'ACTIVE' | 'HALTED';
}

export interface FleetMutationResponse {
  status: string;
  fleet_state: 'ACTIVE' | 'HALTED';
}

export interface AnalyticsOverview {
  agents: {
    total: number;
    active: number;
    revoked: number;
  };
  requests: {
    total: number;
    allowed: number;
    denied: number;
    pending: number;
    allow_rate: number;
    deny_rate: number;
  };
  financial: {
    value_governed: number;
    value_allowed: number;
    value_blocked: number;
    pending_value: number;
  };
}

export interface DenialReason {
  reason: string;
  count: number;
}

export interface AgentHealth {
  agent_id: string;
  agent_name: string;
  requests: number;
  deny_percent: number;
  blocked_value: number;
}

export interface QuarantineResult {
  agent_id: string;
  financial_revocation: 'SUCCESS' | 'FAILED';
  kubernetes_containment: 'SUCCESS' | 'FAILED' | 'NOT_ATTEMPTED';
  overall: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  error?: string | null;
  agent?: Agent | null;
}

export interface AuthorizeRequest {
  agent_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  amount: number;
  currency: string;
  request_id: string;
  simulate?: boolean;
}

export interface AuthorizeResponse {
  decision: 'ALLOW' | 'DENY' | 'PENDING_APPROVAL';
  authorization_id?: string | null;
  policy_id?: string | null;
  remaining_budget?: number | null;
  expires_at?: string | null;
  reason?: string | null;
  trace?: Array<Record<string, unknown>> | null;
}

export interface ApiErrorDetail {
  message: string;
  status?: number;
  detail?: string;
}
