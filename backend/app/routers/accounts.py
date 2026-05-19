"""
Accounts router — /accounts/* endpoints.
"""
from __future__ import annotations

from typing import Optional

import boto3
from fastapi import APIRouter, Cookie, Header, HTTPException

from app.config import SESSION_COOKIE_NAME
from app.deps import (
    ConnectedAccountIn,
    ConnectedAccountUpdateIn,
    assume_account_credentials,
    count_connected_accounts,
    create_connected_account,
    delete_connected_account,
    get_account_limit_for_user,
    get_connected_account,
    get_current_user,
    list_connected_accounts,
    normalize_account_row,
    sanitize_aws_account_id,
    sanitize_external_id,
    sanitize_region,
    sanitize_role_arn,
    sanitize_text,
    update_connected_account,
    update_connected_account_status,
)

router = APIRouter()


@router.post("/accounts")
def create_account(
    payload: ConnectedAccountIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)

    limit = get_account_limit_for_user(user)
    current_count = count_connected_accounts(user_id=user["id"])
    if current_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Your current plan allows up to {limit} connected account(s). Upgrade to add more accounts.",
        )

    customer_name = sanitize_text(payload.customer_name, "customer_name", max_len=120)
    account_name = sanitize_text(payload.account_name, "account_name", max_len=120)
    aws_account_id = sanitize_aws_account_id(payload.aws_account_id)
    role_arn = sanitize_role_arn(payload.role_arn)
    external_id = sanitize_external_id(payload.external_id)
    region = sanitize_region(payload.region)

    account_id = create_connected_account(
        user_id=user["id"],
        customer_name=customer_name,
        account_name=account_name,
        aws_account_id=aws_account_id,
        role_arn=role_arn,
        external_id=external_id,
        region=region,
        status="PENDING",
        is_active=payload.is_active,
    )
    row = get_connected_account(account_id, user_id=user["id"])
    return {"status": "ok", "account": normalize_account_row(row)}


@router.get("/accounts")
def get_accounts(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    accounts = [normalize_account_row(r) for r in list_connected_accounts(user_id=user["id"])]
    return {"accounts": accounts}


@router.get("/accounts/{account_id}")
def get_account(
    account_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)

    row = get_connected_account(account_id, user_id=user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="account not found")
    return {"account": normalize_account_row(row)}


@router.put("/accounts/{account_id}")
def update_account(
    account_id: int,
    payload: ConnectedAccountUpdateIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)

    customer_name = sanitize_text(payload.customer_name, "customer_name", max_len=120)
    account_name = sanitize_text(payload.account_name, "account_name", max_len=120)
    aws_account_id = sanitize_aws_account_id(payload.aws_account_id)
    role_arn = sanitize_role_arn(payload.role_arn)
    external_id = sanitize_external_id(payload.external_id)
    region = sanitize_region(payload.region)
    status = sanitize_text(payload.status, "status", max_len=40)

    ok = update_connected_account(
        account_id=account_id,
        user_id=user["id"],
        customer_name=customer_name,
        account_name=account_name,
        aws_account_id=aws_account_id,
        role_arn=role_arn,
        external_id=external_id,
        region=region,
        status=status,
        is_active=payload.is_active,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="account not found")

    row = get_connected_account(account_id, user_id=user["id"])
    return {"status": "ok", "account": normalize_account_row(row)}


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)

    try:
        ok = delete_connected_account(account_id, user_id=user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not ok:
        raise HTTPException(status_code=404, detail="account not found")

    return {"status": "ok", "deleted": True, "account_id": account_id}


@router.post("/accounts/test-connection/{account_id}")
def test_connection(
    account_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)

    row = get_connected_account(account_id, user_id=user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="account not found")

    account = normalize_account_row(row)
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    try:
        creds = assume_account_credentials(account)
        assumed_sts = boto3.client(
            "sts",
            aws_access_key_id=creds["aws_access_key_id"],
            aws_secret_access_key=creds["aws_secret_access_key"],
            aws_session_token=creds["aws_session_token"],
            region_name=account.get("region") or "us-east-1",
        )
        ident = assumed_sts.get_caller_identity()
        update_connected_account_status(account_id, "ACTIVE")

        refreshed = get_connected_account(account_id, user_id=user["id"])

        return {
            "status": "ok",
            "message": "Connection successful",
            "account_id": account_id,
            "assumed_account": ident.get("Account"),
            "arn": ident.get("Arn"),
            "region": account.get("region"),
            "customer_name": account.get("customer_name"),
            "account_name": account.get("account_name"),
            "account": normalize_account_row(refreshed),
        }
    except Exception as e:
        update_connected_account_status(account_id, "ERROR")
        raise HTTPException(status_code=400, detail=f"Connection test failed: {str(e)}")
