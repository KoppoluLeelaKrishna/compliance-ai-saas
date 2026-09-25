"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AdminUser, AuthMe } from "@/types";
import TopbarActions from "@/components/app/TopbarActions";

type Role = "admin" | "user" | "viewer";

/**
 * Column track for the members table. Only the member column flexes; the
 * fixed tracks stay narrow enough that it keeps room for name and email at
 * the smallest width the split layout is used (~560px card).
 */
const MEMBER_COLS = "minmax(0, 1fr) 112px 104px 76px";

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

const ROLE_GUIDE: { role: Role; summary: string; grants: string[] }[] = [
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

function joinedDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("user");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const [changingRole, setChangingRole] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [armedRemove, setArmedRemove] = useState<number | null>(null);

  const countFor = (role: string) => users.filter(u => u.role === role).length;
  const adminCount = countFor("admin");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? users.filter(u => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q))
      : users;
    // You first, then admins, then everyone else by join date.
    const rank = (u: AdminUser) => (u.id === meId ? 0 : u.role === "admin" ? 1 : 2);
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  }, [users, query, meId]);

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
        setMeId(auth.user.id);
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
      setMessage(`Role updated to ${ROLE_LABEL[newRole] ?? newRole}`);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setChangingRole(null);
    }
  }

  async function handleDelete(userId: number) {
    // First click arms the button; the second click on the same row removes.
    if (armedRemove !== userId) {
      setArmedRemove(userId);
      return;
    }
    setArmedRemove(null);
    setDeletingId(userId);
    setError("");
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE" });
      setMessage("Member removed");
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
      setMessage(`${inviteEmail} invited as ${ROLE_LABEL[inviteRole]}`);
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
          <p className="vc-sub">Invite members, set their role, and control what they can reach in this workspace.</p>
        </div>
      </div>

      {error && <div className="vc-note vc-note-error">{error}</div>}
      {message && !error && (
        <div className="vc-note vc-note-success items-center">
          <span className="flex-1">{message}</span>
          <button type="button" className="vc-link !text-current" onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}

      {/* ── Summary ──────────────────────────────────────────────────── */}
      <div className="vc-grid vc-grid-4">
        <div className="vc-card">
          <div className="vc-stat-label">Members</div>
          <div className="vc-stat vc-stat-sm">{users.length}</div>
          <div className="vc-stat-note">In this workspace</div>
        </div>
        {ROLE_GUIDE.map(({ role }) => (
          <div key={role} className="vc-card">
            <div className="vc-stat-label flex items-center gap-2">
              <span className={`vc-dot ${ROLE_TONE[role]}`} />
              {ROLE_LABEL[role]}s
            </div>
            <div className="vc-stat vc-stat-sm">{countFor(role)}</div>
            <div className="vc-stat-note">
              {users.length ? Math.round((countFor(role) / users.length) * 100) : 0}% of members
            </div>
          </div>
        ))}
      </div>

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
                onChange={(e) => setInviteRole(e.target.value as Role)}
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

      <div className="vc-grid vc-split-panel">
        {/* ── Members ──────────────────────────────────────────────────── */}
        <div className="vc-card vc-card-flush">
          <div className="vc-card-head flex-wrap">
            <div>
              <div className="vc-card-title">Members</div>
              <div className="vc-card-sub">
                {users.length} member{users.length !== 1 ? "s" : ""} · {adminCount} with admin access
              </div>
            </div>
            <label className="vc-search !max-w-[260px] !min-w-[180px]">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="flex-none text-[var(--vc-dim)]" aria-hidden>
                <circle cx="7" cy="7" r="5" />
                <path d="M11 11l3.5 3.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                placeholder="Search members"
                aria-label="Search members"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          <div className="vc-thead" style={{ gridTemplateColumns: MEMBER_COLS }}>
            <span>Member</span>
            <span>Role</span>
            <span>Joined</span>
            <span className="text-right">
              <span className="sr-only">Actions</span>
            </span>
          </div>

          {users.length === 0 ? (
            <div className="vc-empty">No members yet. Invite someone to get started.</div>
          ) : visible.length === 0 ? (
            <div className="vc-empty">No members match “{query}”.</div>
          ) : (
            visible.map((u) => {
              const isMe = u.id === meId;
              const tone = ROLE_TONE[u.role] ?? "vc-neutral";
              const armed = armedRemove === u.id;
              return (
                <div
                  key={u.id}
                  className="vc-tr hover:bg-[var(--vc-fill)]"
                  style={{ gridTemplateColumns: MEMBER_COLS }}
                  onMouseLeave={() => armed && setArmedRemove(null)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`vc-avatar ${tone}`} aria-hidden>
                      {initials(u.name || u.email)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="vc-cell-strong truncate">{u.name || u.email.split("@")[0]}</span>
                        {isMe && <span className="vc-tag !px-1.5 !py-[1px]">You</span>}
                      </div>
                      <div className="vc-cell-sub truncate" title={u.email}>{u.email}</div>
                    </div>
                  </div>

                  <div className={tone}>
                    <select
                      aria-label={`Role for ${u.email}`}
                      className="vc-role-select"
                      value={u.role}
                      disabled={isMe || changingRole === u.id}
                      title={isMe ? "You can't change your own role" : undefined}
                      onChange={(e) => handleChangeRole(u.id, e.target.value)}
                    >
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>

                  <span className="vc-cell tabular-nums">{joinedDate(u.created_at)}</span>

                  <div className="flex justify-end">
                    {!isMe && (
                      <button
                        type="button"
                        className={`vc-row-action ${armed ? "is-armed" : ""}`}
                        onClick={() => handleDelete(u.id)}
                        onBlur={() => armed && setArmedRemove(null)}
                        disabled={deletingId === u.id}
                        aria-label={armed ? `Confirm removing ${u.email}` : `Remove ${u.email}`}
                      >
                        {deletingId === u.id ? "Removing…" : armed ? "Confirm" : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
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

          {ROLE_GUIDE.map(({ role, summary, grants }) => {
            const n = countFor(role);
            return (
              <div key={role} className="vc-role-card">
                <i className={ROLE_TONE[role]} aria-hidden />
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold text-[var(--vc-text)]">{ROLE_LABEL[role]}</span>
                    <span className="text-[12px] text-[var(--vc-dim)] tabular-nums">
                      {n} member{n === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--vc-muted)]">{summary}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {grants.map(g => <span key={g} className="vc-tag">{g}</span>)}
                  </div>
                </div>
              </div>
            );
          })}

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
