export type Account = {
  id: number;
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  role_arn?: string;
  external_id?: string;
  region: string;
  status: string;
  is_active: boolean;
};

export type AuthMe = {
  authenticated: boolean;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
    subscription_status?: string;
  };
};

export type BillingMe = {
  subscription_status: string;
  account_limit: number;
  connected_accounts_used: number;
  stripe?: {
    configured: boolean;
    mode: string;
    webhook_configured: boolean;
    checkout_ready: boolean;
  };
};

export type ScanAccount = {
  scan_id?: string;
  account_id?: number;
  customer_name?: string;
  account_name?: string;
  aws_account_id?: string;
  role_arn?: string;
  region?: string;
  linked_at?: string;
};

export type ScanItem = {
  scan_id: string;
  status: string;
  created_at: string;
  account_id?: number;
  customer_name?: string;
  account_name?: string;
  aws_account_id?: string;
  role_arn?: string;
  region?: string;
  linked_at?: string;
  account?: ScanAccount | null;
};

export type Finding = {
  scan_id: string;
  service: string;
  severity: string;
  check_id: string;
  title: string;
  resource_id: string;
  status: string;
  created_at: string;
  evidence: Record<string, unknown>;
  resolution: string;
  note: string;
  account_id?: number;
  customer_name?: string;
  account_name?: string;
  region?: string;
};

export type FindingsResponse = {
  scan_id: string;
  account?: ScanAccount | null;
  findings: Finding[];
};

export type ActionRow = {
  scan_id: string;
  check_id: string;
  resource_id: string;
  resolution: string;
  note: string;
  created_at: string;
};

export type ActionsResponse = {
  scan_id: string;
  actions: ActionRow[];
};

export type FixGuidance = {
  check_id: string;
  title: string;
  summary: string;
  consolePath: string;
  steps: string[];
  cli: string[];
  terraform: string;
  updated_at: string;
};

export type HealthResponse = {
  ok: boolean;
  app_env: string;
  frontend_url: string;
  cookie_secure: boolean;
  stripe: {
    configured: boolean;
    mode: string;
    webhook_configured: boolean;
    checkout_ready: boolean;
  };
};
