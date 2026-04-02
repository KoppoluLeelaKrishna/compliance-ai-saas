import boto3
from botocore.exceptions import ClientError


ADMIN_POLICY_ARNS = {
    "arn:aws:iam::aws:policy/AdministratorAccess",
}


def _safe(call, default=None):
    try:
        return call()
    except ClientError as e:
        return {"_error": e.response["Error"]["Code"], "_message": str(e)}


def _is_admin_policy_arn(arn: str) -> bool:
    if not arn:
        return False
    if arn in ADMIN_POLICY_ARNS:
        return True
    # sometimes you might attach a customer-managed policy named AdministratorAccess
    return arn.endswith("/AdministratorAccess")


def scan_iam_admin_managed_policy() -> list[dict]:
    """
    Flags any IAM User/Role that has AdministratorAccess (AWS managed or similarly named).
    """
    iam = boto3.client("iam")
    findings: list[dict] = []

    # ---------- USERS ----------
    paginator = iam.get_paginator("list_users")
    for page in paginator.paginate():
        for u in page.get("Users", []):
            user_name = u.get("UserName")
            if not user_name:
                continue

            attached = _safe(lambda: iam.list_attached_user_policies(UserName=user_name), default={})
            if isinstance(attached, dict) and attached.get("_error"):
                # ignore permission errors gracefully
                continue

            for p in attached.get("AttachedPolicies", []) if isinstance(attached, dict) else []:
                arn = p.get("PolicyArn", "")
                pname = p.get("PolicyName", "")

                if _is_admin_policy_arn(arn) or (pname == "AdministratorAccess"):
                    findings.append(
                        {
                            "service": "IAM",
                            "title": "IAM user has AdministratorAccess attached",
                            "check_id": "IAM_ADMIN_MANAGED_POLICY",
                            "severity": "CRITICAL",
                            "resource_id": f"iam://user/{user_name}",
                            "status": "FAIL",
                            "evidence": {
                                "entity_type": "user",
                                "entity_name": user_name,
                                "policy_name": pname,
                                "policy_arn": arn,
                            },
                        }
                    )

    # ---------- ROLES ----------
    role_paginator = iam.get_paginator("list_roles")
    for page in role_paginator.paginate():
        for r in page.get("Roles", []):
            role_name = r.get("RoleName")
            if not role_name:
                continue

            attached = _safe(lambda: iam.list_attached_role_policies(RoleName=role_name), default={})
            if isinstance(attached, dict) and attached.get("_error"):
                continue

            for p in attached.get("AttachedPolicies", []) if isinstance(attached, dict) else []:
                arn = p.get("PolicyArn", "")
                pname = p.get("PolicyName", "")

                if _is_admin_policy_arn(arn) or (pname == "AdministratorAccess"):
                    findings.append(
                        {
                            "service": "IAM",
                            "title": "IAM role has AdministratorAccess attached",
                            "check_id": "IAM_ADMIN_MANAGED_POLICY",
                            "severity": "CRITICAL",
                            "resource_id": f"iam://role/{role_name}",
                            "status": "FAIL",
                            "evidence": {
                                "entity_type": "role",
                                "entity_name": role_name,
                                "policy_name": pname,
                                "policy_arn": arn,
                            },
                        }
                    )

    return findings


# ✅ runner.py expects this exact function name
def run_check(region: str = "us-east-1") -> list[dict]:
    # region not used for IAM, kept for consistent signature
    return scan_iam_admin_managed_policy()