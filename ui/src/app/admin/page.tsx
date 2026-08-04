"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AdminUser, AuthMe } from "@/types";
import TopbarActions from "@/components/app/TopbarActions";

/** Column track for the members table. */
const MEMBER_COLS = "1fr 150px 170px 240px";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  user: "User",
  viewer: "Viewer",
};

const ROLE_TONE: Record<string, string> = {
  admin: "text-[var(--vc-accent-text)]",
  user: "vc-ok",
  viewer: "vc-neutral",
};

const ROLE_GUIDE: { role: string; summary: string; grants: string[] }[] = [
  {
    role: "admin",
    summary: "Full control, including inviting members, changing roles, and billing.",
    grants: ["Members", "Billing", "Accounts", "Scans", "Findings"],
  },
  {
    role: "user",
    summary: "Runs scans, connects accounts, and resolves findings.",
    grants: ["Accounts", "Scans", "Findings"],
  },
  {
    role: "viewer",
    summary: "Read-only. Sees posture and exports evidence, changes nothing.",
    grants: ["Dashboard", "Findings", "Exports"],
  },
];

function initials(value: string) {
  const parts = value.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "viewer" | "admin">("user");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const [changingRole, setChangingRole] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const adminCount = users.filter(u => u.role === "admin").length;

  async function loadUsers() {
    try {
      const data = await api<{ users: AdminUser[] }>("/admin/users");
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (!auth.authenticated || auth.user?.role !== "admin") {
          router.replace("/scans");
          return;
        }
        await loadUsers();
      } catch {
        router.replace("/signin");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  async function handleChangeRole(userId: number, newRole: string) {
    setChangingRole(userId);
    setError("");
    try {
      await api(`/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      setMessage(`Role updated to ${newRole}`);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setChangingRole(null);
    }
  }

  async function handleDelete(userId: number) {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    setDeletingId(userId);
    setError("");
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE" });
      setMessage("User deleted");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError("");
    try {
      await api("/admin/users/invite", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          password: invitePassword,
          role: inviteRole,
        }),
      });
      setMessage(`User ${inviteEmail} invited as ${inviteRole}`);
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      setInviteRole("user");
      setInviteOpen(false);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite user");
    } finally {
      setInviting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <span className="vc-spinner !h-6 !w-6" />
        <div className="vc-sub">Loading members…</div>
      </div>
    );
  }

  return (
    <>
      <TopbarActions>
        <button type="button" className="vc-btn" onClick={loadUsers}>
          Refresh
        </button>
        <button type="button" className="vc-btn-primary" onClick={() => setInviteOpen(o => !o)}>
          {inviteOpen ? "Close" : "Invite member"}
        </button>
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Admin</h1>
          <p className="vc-sub">Members, roles, and who can reach which part of this workspace.</p>
        </div>
      </div>

      {error && <div className="vc-note vc-note-error">{error}</div>}
      {message && !error && (
        <div className="vc-note vc-note-success items-center">
          <span className="flex-1">{message}</span>
          <button type="button" className="vc-link !text-current" onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}

      {inviteOpen && (
        <form onSubmit={handleInvite} className="vc-card">
          <div className="vc-card-title">Invite a team member</div>
          <div className="vc-card-sub mb-5">
            They sign in with the temporary password and can change it from Settings.
          </div>

          <div className="vc-grid vc-grid-4">
            <div>
              <label className="vc-label" htmlFor="inv-email">Email</label>
              <input
                id="inv-email"
                className="vc-input"
                required
                type="email"
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="vc-label" htmlFor="inv-name">Full name</label>
              <input
                id="inv-name"
                className="vc-input"
                required
                type="text"
                placeholder="Priya Shah"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div>
              <label className="vc-label" htmlFor="inv-pass">Temporary password</label>
              <input
                id="inv-pass"
                className="vc-input"
                required
                type="password"
                placeholder="At least 8 characters"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
              />
            </div>
            <div>
              <label className="vc-label" htmlFor="inv-role">Role</label>
              <select
                id="inv-role"
                className="vc-select"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "user" | "viewer" | "admin")}
              >
                <option value="user">User</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className="vc-btn-primary vc-btn-lg" disabled={inviting}>
              {inviting ? "Inviting…" : "Send invitation"}
            </button>
            <button type="button" className="vc-btn-secondary vc-btn-lg" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="vc-grid vc-split-wide">
        {/* ── Members ──────────────────────────────────────────────────── */}
        <div className="vc-card vc-card-flush">
          <div className="vc-card-head">
            <div>
              <div className="vc-card-title">Members</div>
              <div className="vc-card-sub">
                {users.length} member{users.length !== 1 ? "s" : ""} · {adminCount} with admin access
              </div>
            </div>
          </div>

          <div className="vc-thead" style={{ gridTemplateColumns: MEMBER_COLS }}>
            <span>Member</span>
            <span>Role</span>
            <span>Joined</span>
            <span className="text-right">Access</span>
          </div>

          {users.length === 0 ? (
            <div className="vc-empty">No members yet.</div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="vc-tr" style={{ gridTemplateColumns: MEMBER_COLS }}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[var(--vc-chip)] text-[11px] font-semibold text-[var(--vc-text)]">
                    {initials(u.name || u.email)}
                  </span>
                  <div className="min-w-0">
                    <div className="vc-cell-strong truncate">{u.name || "—"}</div>
                    <div className="vc-cell-sub truncate">{u.email}</div>
                  </div>
                </div>

                <span className={`text-[12.5px] font-semibold ${ROLE_TONE[u.role] ?? "vc-neutral"}`}>
                  {ROLE_LABEL[u.role] ?? u.role}
                </span>

                <span className="vc-cell">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </span>

                <div className="flex items-center justify-end gap-2">
                  <select
                    aria-label={`Role for ${u.email}`}
                    className="vc-chip !h-8"
                    value={u.role}
                    disabled={changingRole === u.id}
                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    className="vc-link vc-sev-critical"
                    onClick={() => handleDelete(u.id)}
                    disabled={deletingId === u.id}
                  >
                    {deletingId === u.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Roles reference ──────────────────────────────────────────── */}
        <div className="vc-card vc-card-flush flex flex-col">
          <div className="vc-card-head">
            <div>
              <div className="vc-card-title">Roles and access</div>
              <div className="vc-card-sub">What each role can reach in this workspace</div>
            </div>
          </div>

          {ROLE_GUIDE.map(({ role, summary, grants }) => (
            <div key={role} className="border-b border-[var(--vc-hairline-soft)] px-[22px] py-4 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className={`text-[13.5px] font-semibold ${ROLE_TONE[role]}`}>{ROLE_LABEL[role]}</span>
                <span className="vc-tag">
                  {users.filter(u => u.role === role).length} member
                  {users.filter(u => u.role === role).length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[var(--vc-muted)]">{summary}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {grants.map(g => <span key={g} className="vc-tag">{g}</span>)}
              </div>
            </div>
          ))}

          <div className="vc-card-foot mt-auto">
            <p className="text-[11.5px] leading-[1.5] text-[var(--vc-dim)]">
              Removing a member revokes their session immediately. Connected AWS roles are unaffected —
              revoke those from the client account.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
