export type UserInviteStatus = "active" | "pending_invite" | "inactive";

export type OutletRow = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  is_default: boolean;
};

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  outlet_id: string | null;
  outlet_name: string | null;
  /** Additional outlets granted beyond home outlet (owner assignment). */
  granted_outlet_names: string[];
  is_active: boolean;
  invite_status: UserInviteStatus;
  invited_at: string | null;
};
