from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_PATH = PROJECT_ROOT / "worker" / "compliance.db"


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(row) if row else None


def rows_to_dicts(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    return [dict(r) for r in rows]


def table_columns(conn: sqlite3.Connection, table_name: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return [str(r["name"]) for r in rows]


def add_column_if_missing(
    conn: sqlite3.Connection,
    table_name: str,
    column_name: str,
    ddl: str,
) -> None:
    cols = table_columns(conn, table_name)
    if column_name not in cols:
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {ddl}")


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()

    # -------------------------
    # scans
    # -------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS scans (
            scan_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    # -------------------------
    # findings
    # -------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT NOT NULL,
            service TEXT,
            severity TEXT,
            check_id TEXT,
            title TEXT,
            resource_id TEXT,
            status TEXT,
            created_at TEXT NOT NULL,
            evidence TEXT
        )
        """
    )

    # -------------------------
    # fix guidance
    # -------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS fix_guidance (
            check_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            console_path TEXT NOT NULL,
            steps_json TEXT NOT NULL,
            cli_json TEXT NOT NULL,
            terraform TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )
        """
    )

    # -------------------------
    # finding actions
    # -------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS finding_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT NOT NULL,
            check_id TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            resolution TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(scan_id, check_id, resource_id)
        )
        """
    )

    # -------------------------
    # connected accounts
    # -------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS connected_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            account_name TEXT NOT NULL DEFAULT '',
            aws_account_id TEXT NOT NULL,
            role_arn TEXT NOT NULL,
            external_id TEXT NOT NULL DEFAULT '',
            region TEXT NOT NULL DEFAULT 'us-east-1',
            status TEXT NOT NULL DEFAULT 'PENDING',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    # migration for older DBs
    add_column_if_missing(conn, "connected_accounts", "account_name", "account_name TEXT NOT NULL DEFAULT ''")
    add_column_if_missing(conn, "connected_accounts", "is_active", "is_active INTEGER NOT NULL DEFAULT 1")
    add_column_if_missing(conn, "connected_accounts", "updated_at", f"updated_at TEXT NOT NULL DEFAULT '{now_utc_iso()}'")

    conn.execute(
        """
        UPDATE connected_accounts
        SET account_name = customer_name
        WHERE account_name IS NULL OR trim(account_name) = ''
        """
    )

    # -------------------------
    # scan-account links
    # -------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS scan_account_links (
            scan_id TEXT PRIMARY KEY,
            account_id INTEGER,
            customer_name TEXT,
            account_name TEXT,
            aws_account_id TEXT,
            role_arn TEXT,
            region TEXT,
            linked_at TEXT NOT NULL
        )
        """
    )

    add_column_if_missing(conn, "scan_account_links", "account_name", "account_name TEXT")

    cur.execute("CREATE INDEX IF NOT EXISTS idx_findings_scan_id ON findings(scan_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_actions_scan_id ON finding_actions(scan_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scan_links_account_id ON scan_account_links(account_id)")

    conn.commit()
    conn.close()


# =========================
# Scans
# =========================
def save_scan(scan_id: str, status: str) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO scans (scan_id, status, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(scan_id)
        DO UPDATE SET status = excluded.status
        """,
        (scan_id, status, now_utc_iso()),
    )
    conn.commit()
    conn.close()


def get_scan(scan_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT scan_id, status, created_at
        FROM scans
        WHERE scan_id = ?
        """,
        (scan_id,),
    ).fetchone()
    conn.close()
    return row_to_dict(row)


def list_scans(limit: int = 50, account_id: Optional[int] = None) -> List[Dict[str, Any]]:
    conn = get_conn()

    if account_id is not None:
        rows = conn.execute(
            """
            SELECT
                s.scan_id,
                s.status,
                s.created_at,
                l.account_id,
                l.customer_name,
                l.account_name,
                l.aws_account_id,
                l.role_arn,
                l.region,
                l.linked_at
            FROM scans s
            LEFT JOIN scan_account_links l
              ON s.scan_id = l.scan_id
            WHERE l.account_id = ?
            ORDER BY datetime(s.created_at) DESC
            LIMIT ?
            """,
            (account_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT
                s.scan_id,
                s.status,
                s.created_at,
                l.account_id,
                l.customer_name,
                l.account_name,
                l.aws_account_id,
                l.role_arn,
                l.region,
                l.linked_at
            FROM scans s
            LEFT JOIN scan_account_links l
              ON s.scan_id = l.scan_id
            ORDER BY datetime(s.created_at) DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    conn.close()
    return rows_to_dicts(rows)


# =========================
# Scan ↔ Account links
# =========================
def save_scan_account_link(scan_id: str, account_row: Dict[str, Any]) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO scan_account_links (
            scan_id,
            account_id,
            customer_name,
            account_name,
            aws_account_id,
            role_arn,
            region,
            linked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scan_id)
        DO UPDATE SET
            account_id = excluded.account_id,
            customer_name = excluded.customer_name,
            account_name = excluded.account_name,
            aws_account_id = excluded.aws_account_id,
            role_arn = excluded.role_arn,
            region = excluded.region,
            linked_at = excluded.linked_at
        """,
        (
            scan_id,
            account_row.get("id"),
            account_row.get("customer_name"),
            account_row.get("account_name"),
            account_row.get("aws_account_id"),
            account_row.get("role_arn"),
            account_row.get("region"),
            now_utc_iso(),
        ),
    )
    conn.commit()
    conn.close()


def get_scan_account_link(scan_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT
            scan_id,
            account_id,
            customer_name,
            account_name,
            aws_account_id,
            role_arn,
            region,
            linked_at
        FROM scan_account_links
        WHERE scan_id = ?
        """,
        (scan_id,),
    ).fetchone()
    conn.close()
    return row_to_dict(row)


# =========================
# Findings
# =========================
def save_findings(scan_id: str, findings: List[Dict[str, Any]]) -> None:
    conn = get_conn()
    cur = conn.cursor()

    for finding in findings:
        cur.execute(
            """
            INSERT INTO findings (
                scan_id,
                service,
                severity,
                check_id,
                title,
                resource_id,
                status,
                created_at,
                evidence
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scan_id,
                finding.get("service", ""),
                finding.get("severity", ""),
                finding.get("check_id", ""),
                finding.get("title", ""),
                finding.get("resource_id", ""),
                finding.get("status", ""),
                finding.get("created_at") or now_utc_iso(),
                json.dumps(finding.get("evidence", {})),
            ),
        )

    conn.commit()
    conn.close()


def get_findings(scan_id: str) -> List[Dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT
            f.scan_id,
            f.service,
            f.severity,
            f.check_id,
            f.title,
            f.resource_id,
            f.status,
            f.created_at,
            f.evidence,
            COALESCE(a.resolution, 'OPEN') AS resolution,
            COALESCE(a.note, '') AS note
        FROM findings f
        LEFT JOIN finding_actions a
          ON f.scan_id = a.scan_id
         AND f.check_id = a.check_id
         AND f.resource_id = a.resource_id
        WHERE f.scan_id = ?
        ORDER BY datetime(f.created_at) DESC, f.id DESC
        """,
        (scan_id,),
    ).fetchall()
    conn.close()

    out: List[Dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        try:
            item["evidence"] = json.loads(item["evidence"]) if item["evidence"] else {}
        except Exception:
            item["evidence"] = {}
        out.append(item)

    return out


# =========================
# Fix Guidance
# =========================
def upsert_fix_guidance(
    check_id: str,
    title: str,
    summary: str,
    console_path: str,
    steps: List[str],
    cli: List[str],
    terraform: str = "",
) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO fix_guidance (
            check_id,
            title,
            summary,
            console_path,
            steps_json,
            cli_json,
            terraform,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(check_id)
        DO UPDATE SET
            title = excluded.title,
            summary = excluded.summary,
            console_path = excluded.console_path,
            steps_json = excluded.steps_json,
            cli_json = excluded.cli_json,
            terraform = excluded.terraform,
            updated_at = excluded.updated_at
        """,
        (
            check_id,
            title,
            summary,
            console_path,
            json.dumps(steps),
            json.dumps(cli),
            terraform,
            now_utc_iso(),
        ),
    )
    conn.commit()
    conn.close()


def get_fix_guidance(check_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT
            check_id,
            title,
            summary,
            console_path,
            steps_json,
            cli_json,
            terraform,
            updated_at
        FROM fix_guidance
        WHERE check_id = ?
        """,
        (check_id,),
    ).fetchone()
    conn.close()

    if not row:
        return None

    data = dict(row)
    return {
        "check_id": data["check_id"],
        "title": data["title"],
        "summary": data["summary"],
        "consolePath": data["console_path"],
        "steps": json.loads(data["steps_json"]) if data["steps_json"] else [],
        "cli": json.loads(data["cli_json"]) if data["cli_json"] else [],
        "terraform": data["terraform"] or "",
        "updated_at": data["updated_at"],
    }


# =========================
# Finding Actions
# =========================
def upsert_action(
    scan_id: str,
    check_id: str,
    resource_id: str,
    resolution: str,
    note: str = "",
) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO finding_actions (
            scan_id,
            check_id,
            resource_id,
            resolution,
            note,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(scan_id, check_id, resource_id)
        DO UPDATE SET
            resolution = excluded.resolution,
            note = excluded.note,
            created_at = excluded.created_at
        """,
        (
            scan_id,
            check_id,
            resource_id,
            resolution,
            note or "",
            now_utc_iso(),
        ),
    )
    conn.commit()
    conn.close()


def get_actions(scan_id: str) -> List[Dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT
            scan_id,
            check_id,
            resource_id,
            resolution,
            note,
            created_at
        FROM finding_actions
        WHERE scan_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        """,
        (scan_id,),
    ).fetchall()
    conn.close()
    return rows_to_dicts(rows)


# =========================
# Connected Accounts
# =========================
def create_connected_account(
    customer_name: str,
    account_name: str,
    aws_account_id: str,
    role_arn: str,
    external_id: str = "",
    region: str = "us-east-1",
    status: str = "PENDING",
    is_active: bool = True,
) -> int:
    conn = get_conn()
    cur = conn.cursor()
    now = now_utc_iso()

    cur.execute(
        """
        INSERT INTO connected_accounts (
            customer_name,
            account_name,
            aws_account_id,
            role_arn,
            external_id,
            region,
            status,
            is_active,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            customer_name,
            account_name,
            aws_account_id,
            role_arn,
            external_id or "",
            region or "us-east-1",
            status or "PENDING",
            1 if is_active else 0,
            now,
            now,
        ),
    )
    conn.commit()
    account_id = cur.lastrowid
    conn.close()
    return int(account_id)


def list_connected_accounts() -> List[Dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT
            id,
            customer_name,
            account_name,
            aws_account_id,
            role_arn,
            external_id,
            region,
            status,
            is_active,
            created_at,
            updated_at
        FROM connected_accounts
        ORDER BY datetime(updated_at) DESC, id DESC
        """
    ).fetchall()
    conn.close()
    return rows_to_dicts(rows)


def get_connected_account(account_id: int) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT
            id,
            customer_name,
            account_name,
            aws_account_id,
            role_arn,
            external_id,
            region,
            status,
            is_active,
            created_at,
            updated_at
        FROM connected_accounts
        WHERE id = ?
        """,
        (account_id,),
    ).fetchone()
    conn.close()
    return row_to_dict(row)


def update_connected_account(
    account_id: int,
    customer_name: str,
    account_name: str,
    aws_account_id: str,
    role_arn: str,
    external_id: str = "",
    region: str = "us-east-1",
    status: str = "PENDING",
    is_active: bool = True,
) -> bool:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM connected_accounts WHERE id = ?", (account_id,))
    existing = cur.fetchone()
    if not existing:
        conn.close()
        return False

    cur.execute(
        """
        UPDATE connected_accounts
        SET
            customer_name = ?,
            account_name = ?,
            aws_account_id = ?,
            role_arn = ?,
            external_id = ?,
            region = ?,
            status = ?,
            is_active = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            customer_name,
            account_name,
            aws_account_id,
            role_arn,
            external_id or "",
            region or "us-east-1",
            status or "PENDING",
            1 if is_active else 0,
            now_utc_iso(),
            account_id,
        ),
    )
    conn.commit()
    conn.close()
    return True


def update_connected_account_status(account_id: int, status: str) -> None:
    conn = get_conn()
    conn.execute(
        """
        UPDATE connected_accounts
        SET status = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, now_utc_iso(), account_id),
    )
    conn.commit()
    conn.close()


def delete_connected_account(account_id: int) -> bool:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM connected_accounts WHERE id = ?", (account_id,))
    existing = cur.fetchone()
    if not existing:
        conn.close()
        return False

    cur.execute("SELECT 1 FROM scan_account_links WHERE account_id = ? LIMIT 1", (account_id,))
    linked = cur.fetchone()
    if linked:
        conn.close()
        raise ValueError("Cannot delete account because scans already exist for this account")

    cur.execute("DELETE FROM connected_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return True