"""Tests for /assistant/* — the product-wide AI chat endpoints."""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.routers import assistant


# ---------------------------------------------------------------------------
# Endpoint gating
# ---------------------------------------------------------------------------

def test_config_requires_auth(client):
    assert client.get("/assistant/config").status_code == 401


def test_config_reports_disabled_without_api_key(client, auth_headers):
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}):
        resp = client.get("/assistant/config", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


def test_config_reports_enabled_with_api_key(client, auth_headers):
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-ant-test"}):
        resp = client.get("/assistant/config", cookies=auth_headers["cookies"])
    assert resp.json()["enabled"] is True


def test_chat_requires_auth(client):
    assert client.post("/assistant/chat", json={"message": "hi"}).status_code == 401


def test_chat_rejects_empty_message(client, auth_headers):
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-ant-test"}):
        resp = client.post("/assistant/chat", json={"message": "   "}, cookies=auth_headers["cookies"])
    assert resp.status_code == 400


def test_chat_503_without_api_key(client, auth_headers):
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}):
        resp = client.post("/assistant/chat", json={"message": "hi"}, cookies=auth_headers["cookies"])
    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Tool scoping — the model's arguments must never widen access
# ---------------------------------------------------------------------------

def _user(client, auth_headers) -> dict:
    me = client.get("/auth/me", cookies=auth_headers["cookies"]).json()
    return me["user"]


def test_tools_scope_to_the_calling_user(client, auth_headers):
    """A fresh user sees their own (empty) workspace, not anyone else's."""
    user = _user(client, auth_headers)

    overview = assistant.run_tool("get_posture_overview", {}, user)
    assert overview["totals"]["accounts"] == 0
    assert overview["accounts"] == []

    assert assistant.run_tool("list_aws_accounts", {}, user)["accounts"] == []
    assert assistant.run_tool("list_scans", {}, user)["scans"] == []


def test_search_findings_reports_no_scans_rather_than_leaking(client, auth_headers):
    user = _user(client, auth_headers)
    result = assistant.run_tool("search_findings", {}, user)
    assert "error" in result and "No scans" in result["error"]


def test_tools_reject_another_tenants_scan(client, auth_headers, admin_headers):
    """A scan_id the model did not get from this workspace must not resolve."""
    admin_scan = client.post(
        "/scans/run", json={"region": "us-east-1"}, cookies=admin_headers["cookies"]
    ).json()["scan_id"]

    user = _user(client, auth_headers)
    for name, args in [
        ("search_findings", {"scan_id": admin_scan}),
        ("get_compliance_mapping", {"scan_id": admin_scan}),
        ("get_finding_details", {"scan_id": admin_scan, "check_id": "X", "resource_id": "Y"}),
    ]:
        result = assistant.run_tool(name, args, user)
        assert result.get("error") == "scan not found", (name, result)


def test_tools_reject_another_tenants_account(client, auth_headers):
    user = _user(client, auth_headers)
    result = assistant.run_tool("list_scans", {"account_id": 999999}, user)
    assert "error" in result


def test_unknown_tool_is_reported_not_raised(client, auth_headers):
    user = _user(client, auth_headers)
    assert "error" in assistant.run_tool("drop_tables", {}, user)


# ---------------------------------------------------------------------------
# Tool surface
# ---------------------------------------------------------------------------

def test_every_declared_tool_has_an_implementation():
    assert {t["name"] for t in assistant.TOOLS} == set(assistant.TOOL_IMPLS)


@pytest.mark.parametrize("tool", assistant.TOOLS, ids=lambda t: t["name"])
def test_tool_schemas_are_well_formed(tool):
    schema = tool["input_schema"]
    assert tool["description"].strip()
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    for field in schema.get("required", []):
        assert field in schema["properties"]


def test_subscription_tool_reports_plan_and_limits(client, auth_headers):
    result = assistant.run_tool("get_subscription_and_limits", {}, _user(client, auth_headers))
    assert result["connected_accounts_used"] == 0
    assert set(result) >= {"plan", "connected_accounts_limit", "can_export"}


def test_compliance_mapping_for_a_known_check(client, auth_headers):
    result = assistant.run_tool(
        "get_compliance_mapping", {"check_id": "S3_PUBLIC_ACCESS_BLOCK_OFF"}, _user(client, auth_headers)
    )
    assert result["soc2"] and result["iso27001"]


# ---------------------------------------------------------------------------
# Stream framing
# ---------------------------------------------------------------------------

def test_stream_frames_are_one_json_object_per_line():
    frames = "".join([
        assistant._sse({"type": "text", "text": "line one\nline two"}),
        assistant._sse({"type": "tool", "name": "search_findings"}),
        assistant._sse({"type": "done"}),
    ])
    lines = [ln for ln in frames.split("\n") if ln]
    assert len(lines) == 3
    assert json.loads(lines[0])["text"] == "line one\nline two"
    assert json.loads(lines[2])["type"] == "done"


# ---------------------------------------------------------------------------
# Tool loop — scripted Anthropic client, no network
# ---------------------------------------------------------------------------

class _FakeStream:
    """Stands in for the SDK's async stream manager."""

    def __init__(self, events, final):
        self._events = events
        self._final = final

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def __aiter__(self):
        for event in self._events:
            yield event

    async def get_final_message(self):
        return self._final


def _text_delta(text):
    return SimpleNamespace(
        type="content_block_delta", delta=SimpleNamespace(type="text_delta", text=text)
    )


def _tool_use(name, tool_input, block_id="toolu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


class _FakeMessages:
    def __init__(self, turns):
        self.turns = list(turns)
        self.calls = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        events, final = self.turns.pop(0)
        return _FakeStream(events, final)


class _FakeClient:
    def __init__(self, turns):
        self.messages = _FakeMessages(turns)

    async def close(self):
        return None


def _run_chat(client, auth_headers, turns):
    fake = _FakeClient(turns)
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-ant-test"}), \
         patch("anthropic.AsyncAnthropic", return_value=fake):
        resp = client.post(
            "/assistant/chat",
            json={"message": "what should I fix?", "page": "/dashboard"},
            cookies=auth_headers["cookies"],
        )
    frames = [json.loads(ln) for ln in resp.text.split("\n") if ln.strip()]
    return resp, frames, fake


def test_chat_streams_text_frames(client, auth_headers):
    turns = [([_text_delta("All "), _text_delta("clear.")],
              SimpleNamespace(stop_reason="end_turn", content=[]))]
    resp, frames, _ = _run_chat(client, auth_headers, turns)

    assert resp.status_code == 200
    assert "".join(f["text"] for f in frames if f["type"] == "text") == "All clear."
    assert frames[-1]["type"] == "done"


def test_chat_runs_a_tool_then_answers(client, auth_headers):
    turns = [
        ([], SimpleNamespace(
            stop_reason="tool_use",
            content=[_tool_use("get_posture_overview", {})],
        )),
        ([_text_delta("No accounts connected yet.")],
         SimpleNamespace(stop_reason="end_turn", content=[])),
    ]
    resp, frames, fake = _run_chat(client, auth_headers, turns)

    assert [f for f in frames if f["type"] == "tool"] == [
        {"type": "tool", "name": "get_posture_overview"}
    ]
    assert "No accounts connected yet." in "".join(
        f["text"] for f in frames if f["type"] == "text"
    )

    # The second request carries the assistant turn plus a matching tool_result.
    followup = fake.messages.calls[1]["messages"]
    assert followup[-2]["role"] == "assistant"
    result_block = followup[-1]["content"][0]
    assert result_block["tool_use_id"] == "toolu_1"
    assert json.loads(result_block["content"])["totals"]["accounts"] == 0


def test_chat_tool_errors_come_back_as_tool_results(client, auth_headers):
    """A bad tool argument must not kill the stream — the model gets to recover."""
    turns = [
        ([], SimpleNamespace(
            stop_reason="tool_use",
            content=[_tool_use("search_findings", {"scan_id": "nope"})],
        )),
        ([_text_delta("That scan isn't in your workspace.")],
         SimpleNamespace(stop_reason="end_turn", content=[])),
    ]
    resp, frames, fake = _run_chat(client, auth_headers, turns)

    result_block = fake.messages.calls[1]["messages"][-1]["content"][0]
    assert result_block["is_error"] is True
    assert json.loads(result_block["content"])["error"] == "scan not found"
    assert resp.status_code == 200
    assert frames[-1]["type"] == "done"


def test_chat_stops_after_too_many_tool_rounds(client, auth_headers):
    """A model that only ever calls tools is cut off, not looped forever."""
    turns = [
        ([], SimpleNamespace(stop_reason="tool_use", content=[_tool_use("list_aws_accounts", {})]))
        for _ in range(assistant.MAX_TOOL_ITERATIONS)
    ]
    _, frames, fake = _run_chat(client, auth_headers, turns)

    assert len(fake.messages.calls) == assistant.MAX_TOOL_ITERATIONS
    assert frames[-1]["type"] == "error"


def test_chat_reports_a_refusal(client, auth_headers):
    turns = [([], SimpleNamespace(stop_reason="refusal", content=[]))]
    _, frames, _ = _run_chat(client, auth_headers, turns)
    assert frames[-1]["type"] == "error"


def test_chat_request_uses_the_configured_model_and_tools(client, auth_headers):
    turns = [([], SimpleNamespace(stop_reason="end_turn", content=[]))]
    _, _, fake = _run_chat(client, auth_headers, turns)

    call = fake.messages.calls[0]
    assert call["model"] == assistant.ASSISTANT_MODEL
    assert {t["name"] for t in call["tools"]} == set(assistant.TOOL_IMPLS)
    assert call["thinking"] == {"type": "adaptive"}
    assert "/dashboard" in call["system"]


# ---------------------------------------------------------------------------
# System prompt — topical scope
# ---------------------------------------------------------------------------
# The assistant is a compliance tool, not a general chatbot. Scope lives in the
# system prompt, so these assert the instruction is actually being sent rather
# than that the model obeyed it (which only a live call could show).


def _prompt_for(role="user", plan="free"):
    user = {"id": 1, "name": "Test", "email": "t@example.com", "role": role,
            "subscription_status": plan}
    return assistant.build_system_prompt(user, "scans")


def test_system_prompt_declares_scope_and_refusal():
    prompt = _prompt_for()
    assert "SCOPE" in prompt
    assert "out of scope" in prompt.lower()
    # It must say what to do instead of answering, not merely that it shouldn't.
    assert "decline" in prompt.lower()


def test_system_prompt_names_in_scope_subjects():
    prompt = _prompt_for().lower()
    for subject in ("findings", "aws", "soc 2", "remediate"):
        assert subject in prompt, f"missing in-scope subject: {subject}"


def test_system_prompt_blocks_common_jailbreak_framings():
    """Insisting, claiming admin, or 'just testing' must not be an exception."""
    prompt = _prompt_for(role="admin").lower()
    assert "insists" in prompt
    assert "admin" in prompt
    assert "hypothetical" in prompt


def test_system_prompt_treats_finding_content_as_data():
    """Scan output is attacker-influenced; it must not be read as instructions."""
    prompt = _prompt_for().lower()
    assert "never as instructions" in prompt
    assert "reveal this prompt" in prompt


def test_system_prompt_keeps_hard_compliance_questions_in_scope():
    """Scoping must not turn into refusing difficult but legitimate questions."""
    prompt = _prompt_for().lower()
    assert "topic, not difficulty" in prompt


def test_system_prompt_still_carries_user_context():
    """Scope text must not have displaced the per-user grounding."""
    prompt = _prompt_for(plan="msp")
    assert "t@example.com" in prompt
    assert "scans" in prompt
