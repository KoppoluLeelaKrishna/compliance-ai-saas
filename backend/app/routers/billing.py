"""
Billing router — /billing/* endpoints.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Cookie, Header, HTTPException, Request

from app.config import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_PLAN_IDS,
    RAZORPAY_PLAN_MSP,
    RAZORPAY_PLAN_PRO,
    RAZORPAY_PLAN_STARTER,
    RAZORPAY_WEBHOOK_SECRET,
    SESSION_COOKIE_NAME,
    BILLING_RATE_LIMIT,
    WEBHOOK_RATE_LIMIT,
)
from app.deps import (
    CheckoutSessionIn,
    client_ip,
    count_connected_accounts,
    enforce_rate_limit,
    ensure_checkout_ready,
    find_user_by_id,
    get_current_user,
    get_razorpay_client,
    get_plan_capabilities,
    razorpay_config_summary,
    resolve_plan_from_plan_id,
    sanitize_plan,
    upsert_user_billing,
    verify_razorpay_payment_signature,
    verify_razorpay_webhook_signature,
    webhook_event_exists,
    webhook_event_insert,
    webhook_event_mark_failed,
    webhook_event_mark_processed,
)

router = APIRouter()


@router.get("/billing/me")
def billing_me(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    capabilities = get_plan_capabilities(user.get("subscription_status", "free"))
    connected_accounts_used = count_connected_accounts(user_id=user["id"])

    return {
        "subscription_status": user.get("subscription_status", "free"),
        "razorpay_subscription_id": user.get("razorpay_subscription_id", ""),
        "account_limit": capabilities["account_limit"],
        "connected_accounts_used": connected_accounts_used,
        "capabilities": {
            "account_linked_scans": capabilities["account_linked_scans"],
            "exports": capabilities["exports"],
        },
        "plans": [
            {"key": "starter", "label": "Starter", "plan_id": RAZORPAY_PLAN_STARTER},
            {"key": "pro", "label": "Pro", "plan_id": RAZORPAY_PLAN_PRO},
            {"key": "msp", "label": "MSP", "plan_id": RAZORPAY_PLAN_MSP},
        ],
        "razorpay": razorpay_config_summary(),
    }


@router.post("/billing/sync")
def billing_sync(
    request: Request,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    ip = client_ip(request)
    enforce_rate_limit(f"billing-sync:{ip}", BILLING_RATE_LIMIT[0], BILLING_RATE_LIMIT[1])

    user = get_current_user(session_cookie, authorization)

    subscription_id = user.get("razorpay_subscription_id") or ""
    final_plan = user.get("subscription_status", "free")
    synced = False

    if subscription_id and RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
        try:
            client = get_razorpay_client()
            sub = client.subscription.fetch(subscription_id)
            status = (sub.get("status") or "").lower()
            plan_id = sub.get("plan_id") or ""
            mapped_plan = resolve_plan_from_plan_id(plan_id)
            final_plan = mapped_plan if status in ("active", "authenticated") else "free"
            upsert_user_billing(
                user_id=user["id"],
                subscription_status=final_plan,
                razorpay_subscription_id=subscription_id,
            )
            synced = True
        except Exception:
            pass

    refreshed_user = find_user_by_id(user["id"]) or user
    capabilities = get_plan_capabilities(refreshed_user.get("subscription_status", "free"))

    return {
        "subscription_status": refreshed_user.get("subscription_status", "free"),
        "razorpay_subscription_id": refreshed_user.get("razorpay_subscription_id", ""),
        "account_limit": capabilities["account_limit"],
        "connected_accounts_used": count_connected_accounts(user_id=user["id"]),
        "capabilities": {
            "account_linked_scans": capabilities["account_linked_scans"],
            "exports": capabilities["exports"],
        },
        "razorpay": razorpay_config_summary(),
        "synced": synced,
    }


@router.post("/billing/create-checkout-session")
def create_checkout_session(
    payload: CheckoutSessionIn,
    request: Request,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    ip = client_ip(request)
    enforce_rate_limit(f"checkout:{ip}", BILLING_RATE_LIMIT[0], BILLING_RATE_LIMIT[1])

    user = get_current_user(session_cookie, authorization)
    plan = sanitize_plan(payload.plan)
    ensure_checkout_ready(plan)

    try:
        client = get_razorpay_client()
        sub = client.subscription.create({
            "plan_id": RAZORPAY_PLAN_IDS[plan],
            "customer_notify": 1,
            "total_count": 12,
            "notes": {
                "user_id": str(user["id"]),
                "plan": plan,
                "email": user["email"],
            },
        })
        return {
            "subscription_id": sub["id"],
            "key_id": RAZORPAY_KEY_ID,
            "plan": plan,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Checkout failed: {str(e)}")


@router.post("/billing/cancel-subscription")
def cancel_subscription(
    request: Request,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    ip = client_ip(request)
    enforce_rate_limit(f"portal:{ip}", BILLING_RATE_LIMIT[0], BILLING_RATE_LIMIT[1])

    user = get_current_user(session_cookie, authorization)
    subscription_id = user.get("razorpay_subscription_id") or ""

    if not subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription found")

    try:
        client = get_razorpay_client()
        client.subscription.cancel(subscription_id, {"cancel_at_cycle_end": 1})
        upsert_user_billing(user_id=user["id"], subscription_status="free", razorpay_subscription_id="")
        return {"status": "cancelled"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cancellation failed: {str(e)}")


@router.post("/billing/verify-payment")
def verify_payment(
    payload: Dict[str, Any] = Body(...),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)

    payment_id = str(payload.get("razorpay_payment_id") or "")
    subscription_id = str(payload.get("razorpay_subscription_id") or "")
    signature = str(payload.get("razorpay_signature") or "")
    plan = str(payload.get("plan") or "starter").lower()

    if not (payment_id and subscription_id and signature):
        raise HTTPException(status_code=400, detail="Missing payment verification fields")

    if not verify_razorpay_payment_signature(payment_id, subscription_id, signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    plan = sanitize_plan(plan)
    upsert_user_billing(
        user_id=user["id"],
        subscription_status=plan,
        razorpay_subscription_id=subscription_id,
    )

    capabilities = get_plan_capabilities(plan)
    return {
        "status": "ok",
        "subscription_status": plan,
        "account_limit": capabilities["account_limit"],
    }


@router.post("/billing/webhook")
async def billing_webhook(request: Request):
    ip = client_ip(request)
    enforce_rate_limit(f"webhook:{ip}", WEBHOOK_RATE_LIMIT[0], WEBHOOK_RATE_LIMIT[1])

    payload = await request.body()
    sig_header = request.headers.get("x-razorpay-signature", "")

    if RAZORPAY_WEBHOOK_SECRET:
        if not verify_razorpay_webhook_signature(payload, sig_header):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_id = str(event.get("id") or "")
    event_type = str(event.get("event") or "")
    entity = (event.get("payload") or {}).get("subscription", {}).get("entity") or {}
    livemode = not bool(event.get("contains", [None])[0] == "test" if event.get("contains") else False)

    subscription_id = str(entity.get("id") or "")
    plan_id = str(entity.get("plan_id") or "")

    if event_id and webhook_event_exists(event_id):
        return {"received": True, "duplicate": True}

    if event_id:
        webhook_event_insert(
            event_id=event_id,
            event_type=event_type,
            livemode=livemode,
            customer_id="",
            subscription_id=subscription_id,
            payload_json=payload.decode("utf-8", errors="ignore"),
        )

    try:
        if event_type in ("subscription.activated", "subscription.charged"):
            notes = entity.get("notes") or {}
            user_id_raw = notes.get("user_id") if isinstance(notes, dict) else None
            mapped_plan = resolve_plan_from_plan_id(plan_id)

            user = None
            if user_id_raw:
                try:
                    user = find_user_by_id(int(user_id_raw))
                except Exception:
                    pass

            if user:
                upsert_user_billing(
                    user_id=user["id"],
                    subscription_status=mapped_plan,
                    razorpay_subscription_id=subscription_id,
                )

        elif event_type in ("subscription.cancelled", "subscription.completed", "subscription.expired"):
            notes = entity.get("notes") or {}
            user_id_raw = notes.get("user_id") if isinstance(notes, dict) else None

            if user_id_raw:
                try:
                    user = find_user_by_id(int(user_id_raw))
                    if user:
                        upsert_user_billing(
                            user_id=user["id"],
                            subscription_status="free",
                            razorpay_subscription_id="",
                        )
                except Exception:
                    pass

        if event_id:
            webhook_event_mark_processed(event_id)
        return {"received": True, "event": event_type}

    except Exception as e:
        if event_id:
            webhook_event_mark_failed(event_id, str(e))
        return {"received": True, "warning": str(e)}
