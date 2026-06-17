"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AdminUser, AuthMe } from "@/types";

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

  const [changingRole, setChangingRole] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite user");
    } finally {
      setInviting(false);
    }
  }

  const ROLE_BADGE: Record<string, string> = {
    admin: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    user: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    viewer: "border-neutral-500/30 bg-neutral-500/10 text-neutral-400",
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="space-y-6 pb-24">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-purple-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-purple-500/[0.06] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-500/25 bg-purple-500/10">
            <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Invite team members, assign roles, manage access</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-4 text-sm text-red-300">
          <span className="mt-0.5">✕</span><span>{error}</span>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">
          <span className="mt-0.5">✓</span>
          <span>{message}</span>
          <button type="button" onClick={() => setMessage("")} className="ml-auto text-neutral-600 hover:text-neutral-400 text-xs">✕</button>
        </div>
      )}

      {/* Invite form */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="mb-4 text-sm font-semibold text-neutral-300">Invite a Team Member</div>
        <form onSubmit={handleInvite} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            required
            type="email"
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/50 focus:outline-none"
          />
          <input
            required
            type="text"
            placeholder="Full name"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/50 focus:outline-none"
          />
          <input
            required
            type="password"
            placeholder="Temporary password"
            value={invitePassword}
            onChange={(e) => setInvitePassword(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/50 focus:outline-none"
          />
          <div className="flex gap-2">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "user" | "viewer" | "admin")}
              className="flex-1 rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="user">User</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-colors"
            >
              {inviting ? "Inviting…" : "Invite"}
            </button>
          </div>
        </form>
        <div className="mt-3 text-[11px] text-neutral-600">
          <span className="font-semibold text-purple-400">Admin</span> — full access including user management &nbsp;·&nbsp;
          <span className="font-semibold text-emerald-400">User</span> — can run scans and manage findings &nbsp;·&nbsp;
          <span className="font-semibold text-neutral-400">Viewer</span> — read-only access
        </div>
      </div>

      {/* User table */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <div className="border-b border-white/[0.05] px-6 py-4">
          <div className="text-sm font-semibold text-neutral-300">{users.length} member{users.length !== 1 ? "s" : ""}</div>
        </div>
        {users.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-neutral-600">No users found.</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-bold text-neutral-300">
                  {u.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-200 truncate">{u.name || "—"}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ROLE_BADGE[u.role] ?? ROLE_BADGE.viewer}`}>
                      {u.role}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-600 truncate">{u.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={u.role}
                    disabled={changingRole === u.id}
                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                    className="rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-50"
                  >
                    <option value="user">User</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleDelete(u.id)}
                    disabled={deletingId === u.id}
                    className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
                  >
                    {deletingId === u.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
