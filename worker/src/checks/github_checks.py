"""
GitHub Organization compliance checks.
Uses the GitHub REST API via the stored GitHub token (no boto3 needed).
Returns findings in the same shape as AWS checks so the scan runner
can treat them uniformly.
"""
from __future__ import annotations

import json
import urllib.request as _ur
import urllib.error as _ue
from typing import Any, Dict, List


def _gh_get(path: str, token: str) -> Any:
    url = f"https://api.github.com{path}"
    req = _ur.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with _ur.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def run(token: str, org: str = "") -> List[Dict[str, Any]]:
    """
    Run GitHub compliance checks.
    `token`  — GitHub personal access token or OAuth token
    `org`    — GitHub org name (optional; derived from token's first org if blank)
    """
    findings: List[Dict[str, Any]] = []

    # ── Resolve org ──────────────────────────────────────────────────────────
    try:
        if not org:
            orgs = _gh_get("/user/orgs", token)
            if not orgs:
                findings.append({
                    "service": "GitHub",
                    "severity": "LOW",
                    "check_id": "GITHUB_NO_ORG",
                    "title": "No GitHub organization found for this token",
                    "resource_id": "github://user",
                    "status": "FAIL",
                    "evidence": {},
                })
                return findings
            org = orgs[0]["login"]
    except Exception as e:
        findings.append({
            "service": "GitHub",
            "severity": "HIGH",
            "check_id": "GITHUB_API_ERROR",
            "title": "GitHub API connection failed",
            "resource_id": "github://api",
            "status": "FAIL",
            "evidence": {"error": str(e)},
        })
        return findings

    resource_prefix = f"github://orgs/{org}"

    # ── 1. Org-level 2FA requirement ─────────────────────────────────────────
    try:
        org_data = _gh_get(f"/orgs/{org}", token)
        two_fa_required = org_data.get("two_factor_requirement_enabled", False)
        if two_fa_required:
            findings.append({
                "service": "GitHub",
                "severity": "INFO",
                "check_id": "GITHUB_ORG_MFA_REQUIRED",
                "title": "GitHub org requires 2FA for all members",
                "resource_id": f"{resource_prefix}",
                "status": "PASS",
                "evidence": {"two_factor_requirement_enabled": True},
            })
        else:
            findings.append({
                "service": "GitHub",
                "severity": "CRITICAL",
                "check_id": "GITHUB_ORG_MFA_NOT_REQUIRED",
                "title": "GitHub org does not require 2FA for members",
                "resource_id": f"{resource_prefix}",
                "status": "FAIL",
                "evidence": {"two_factor_requirement_enabled": False, "org": org},
            })
    except Exception as e:
        findings.append({
            "service": "GitHub",
            "severity": "MEDIUM",
            "check_id": "GITHUB_ORG_READ_ERROR",
            "title": "Could not read GitHub org settings",
            "resource_id": f"{resource_prefix}",
            "status": "FAIL",
            "evidence": {"error": str(e)},
        })

    # ── 2. Branch protection on default branches ─────────────────────────────
    try:
        repos = _gh_get(f"/orgs/{org}/repos?per_page=50&sort=pushed", token)
        for repo in repos[:20]:  # Check top 20 most recently pushed repos
            repo_name = repo["name"]
            default_branch = repo.get("default_branch", "main")
            archived = repo.get("archived", False)
            if archived:
                continue
            try:
                bp = _gh_get(
                    f"/repos/{org}/{repo_name}/branches/{default_branch}/protection",
                    token,
                )
                required_reviews = bp.get("required_pull_request_reviews", {})
                required_count = required_reviews.get("required_approving_review_count", 0)
                enforce_admins = bp.get("enforce_admins", {}).get("enabled", False)

                if required_count >= 1:
                    findings.append({
                        "service": "GitHub",
                        "severity": "INFO",
                        "check_id": "GITHUB_BRANCH_PROTECTION_ENABLED",
                        "title": f"Branch protection enabled on {default_branch}",
                        "resource_id": f"github://repos/{org}/{repo_name}/{default_branch}",
                        "status": "PASS",
                        "evidence": {
                            "repo": repo_name,
                            "branch": default_branch,
                            "required_approving_review_count": required_count,
                            "enforce_admins": enforce_admins,
                        },
                    })
                else:
                    findings.append({
                        "service": "GitHub",
                        "severity": "HIGH",
                        "check_id": "GITHUB_BRANCH_NO_REQUIRED_REVIEWS",
                        "title": f"No required PR reviews on {org}/{repo_name}/{default_branch}",
                        "resource_id": f"github://repos/{org}/{repo_name}/{default_branch}",
                        "status": "FAIL",
                        "evidence": {
                            "repo": repo_name,
                            "branch": default_branch,
                            "required_approving_review_count": required_count,
                        },
                    })
            except _ue.HTTPError as e:
                if e.code == 404:
                    # No branch protection at all
                    findings.append({
                        "service": "GitHub",
                        "severity": "CRITICAL",
                        "check_id": "GITHUB_BRANCH_PROTECTION_OFF",
                        "title": f"No branch protection on {org}/{repo_name}/{default_branch}",
                        "resource_id": f"github://repos/{org}/{repo_name}/{default_branch}",
                        "status": "FAIL",
                        "evidence": {"repo": repo_name, "branch": default_branch},
                    })
                else:
                    pass  # Skip repos we can't read
    except Exception:
        pass  # Non-fatal — repos might not be accessible

    # ── 3. Default repo visibility ────────────────────────────────────────────
    try:
        org_data2 = _gh_get(f"/orgs/{org}", token)
        default_repo_perm = org_data2.get("default_repository_permission", "read")
        members_can_create_public = org_data2.get("members_can_create_public_repositories", True)

        if members_can_create_public:
            findings.append({
                "service": "GitHub",
                "severity": "MEDIUM",
                "check_id": "GITHUB_MEMBERS_CAN_CREATE_PUBLIC_REPOS",
                "title": "Org members can create public repositories",
                "resource_id": f"{resource_prefix}",
                "status": "FAIL",
                "evidence": {"members_can_create_public_repositories": True},
            })
        else:
            findings.append({
                "service": "GitHub",
                "severity": "INFO",
                "check_id": "GITHUB_PUBLIC_REPO_CREATION_RESTRICTED",
                "title": "Public repo creation restricted to admins",
                "resource_id": f"{resource_prefix}",
                "status": "PASS",
                "evidence": {"members_can_create_public_repositories": False},
            })
    except Exception:
        pass

    return findings
