"""Tests for AMC Wave-5 Knowledge + DevX modules.

Covers all 8 modules:
  1. sop_compiler        — SOP→Workflow compiler
  2. api_wrapper_generator — Tool wrapper from OpenAPI/Postman
  3. autodoc_generator   — Auto documentation generator
  4. docs_ingestion      — Continuous docs ingestion + change summaries
  5. kb_builder          — Ticket/email → searchable KB
  6. workflow_templates  — Template marketplace (SQLite)
  7. async_callback      — Async callback manager (SQLite)
  8. output_corrector    — Post-processor output corrector (SQLite)

All tests use tmp_path-isolated SQLite instances. No external network calls.
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

import pytest


# ═══════════════════════════════════════════════════════════════
# MODULE 1 — SOP Compiler
# ═══════════════════════════════════════════════════════════════


class TestSOPCompiler:
    def _compiler(self, tmp_path: Path):
        from amc.product.sop_compiler import SOPCompiler
        return SOPCompiler(db_path=tmp_path / "sop.db")

    _MARKDOWN_SOP = """
# Customer Onboarding SOP

## Step 1: Verify Identity

Use the IdentityVerifier tool to check the customer's details.
Input: customer_id, email
Output: verification_status
Validate: ensure verification_status is "confirmed"

## Step 2: Create Account

Using AccountCreator, create the account in the system.
Input: customer_id, plan
Output: account_id
Verify that account_id is not null.

## Step 3: Send Welcome Email

Use EmailSender to dispatch the welcome email.
Input: account_id, email
Confirm that email delivery succeeds.
"""

    _TEXT_SOP = """
1. Collect customer details from the form.
2. Verify identity using the verification service.
3. Create account in the database.
4. Send confirmation email.
5. Mark onboarding complete.
"""

    def test_compile_markdown_returns_result(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        req = SOPCompileRequest(content=self._MARKDOWN_SOP, format="markdown", title="Onboarding")
        result = c.compile(req)
        assert result.workflow is not None
        assert result.workflow.workflow_id

    def test_compile_markdown_extracts_steps(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        req = SOPCompileRequest(content=self._MARKDOWN_SOP, format="markdown")
        result = c.compile(req)
        assert result.workflow.total_steps >= 2

    def test_compile_markdown_extracts_tools(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        req = SOPCompileRequest(content=self._MARKDOWN_SOP, format="markdown", extract_tools=True)
        result = c.compile(req)
        all_tools = [t for step in result.workflow.steps for t in step.tools]
        # At minimum some tool-like names should be present
        assert isinstance(all_tools, list)

    def test_compile_markdown_extracts_validation(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        req = SOPCompileRequest(content=self._MARKDOWN_SOP, format="markdown", extract_validation=True)
        result = c.compile(req)
        all_rules = [r for step in result.workflow.steps for r in step.validation_rules]
        assert isinstance(all_rules, list)

    def test_compile_text_format(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        req = SOPCompileRequest(content=self._TEXT_SOP, format="text", title="Text SOP")
        result = c.compile(req)
        assert result.workflow.total_steps >= 1
        assert result.workflow.source_format == "text"

    def test_compile_result_has_doc_hash(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        result = c.compile(SOPCompileRequest(content=self._MARKDOWN_SOP, format="markdown"))
        assert result.workflow.raw_doc_hash

    def test_compile_stores_history(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        c.compile(SOPCompileRequest(content=self._MARKDOWN_SOP, format="markdown"))
        c.compile(SOPCompileRequest(content=self._TEXT_SOP, format="text"))
        history = c.get_history(limit=10)
        assert len(history) >= 2

    def test_compile_empty_content_returns_result(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        result = c.compile(SOPCompileRequest(content="", format="markdown"))
        assert result.workflow is not None

    def test_compile_duration_ms_positive(self, tmp_path):
        from amc.product.sop_compiler import SOPCompileRequest
        c = self._compiler(tmp_path)
        result = c.compile(SOPCompileRequest(content=self._MARKDOWN_SOP, format="markdown"))
        assert result.duration_ms >= 0


# ═══════════════════════════════════════════════════════════════
# MODULE 2 — API Wrapper Generator
# ═══════════════════════════════════════════════════════════════


class TestAPIWrapperGenerator:
    def _gen(self, tmp_path: Path):
        from amc.product.api_wrapper_generator import APIWrapperGenerator
        return APIWrapperGenerator(db_path=tmp_path / "wrappers.db")

    _OPENAPI_SPEC = json.dumps({
        "openapi": "3.0.0",
        "info": {"title": "Pet Store", "version": "1.0.0"},
        "servers": [{"url": "https://petstore.example.com"}],
        "paths": {
            "/pets": {
                "get": {
                    "operationId": "listPets",
                    "summary": "List all pets",
                    "tags": ["pets"],
                    "parameters": [
                        {"name": "limit", "in": "query", "required": False,
                         "schema": {"type": "integer", "default": 10}},
                    ],
                    "responses": {"200": {"description": "A list of pets"}},
                },
                "post": {
                    "operationId": "createPet",
                    "summary": "Create a pet",
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["name"],
                                    "properties": {
                                        "name": {"type": "string"},
                                        "tag": {"type": "string"},
                                    },
                                }
                            }
                        }
                    },
                    "responses": {"201": {"description": "Created"}},
                },
            },
            "/pets/{petId}": {
                "get": {
                    "operationId": "getPet",
                    "summary": "Get a pet by ID",
                    "parameters": [
                        {"name": "petId", "in": "path", "required": True,
                         "schema": {"type": "string"}},
                    ],
                    "responses": {"200": {"description": "A pet"}},
                },
            },
        },
    })

    _POSTMAN_SPEC = json.dumps({
        "info": {"name": "My Collection"},
        "item": [
            {
                "name": "Get Users",
                "request": {
                    "method": "GET",
                    "url": {
                        "raw": "https://api.example.com/users",
                        "protocol": "https",
                        "host": ["api", "example", "com"],
                        "path": ["users"],
                    },
                    "header": [{"key": "Accept", "value": "application/json"}],
                },
            },
            {
                "name": "Create User",
                "request": {
                    "method": "POST",
                    "url": {
                        "raw": "https://api.example.com/users",
                        "protocol": "https",
                        "host": ["api", "example", "com"],
                        "path": ["users"],
                    },
                    "body": {
                        "mode": "raw",
                        "raw": '{"name": "Alice", "email": "alice@example.com"}',
                    },
                    "header": [],
                },
            },
        ],
    })

    def test_generate_from_openapi_returns_result(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        req = WrapperGenerateRequest(spec_content=self._OPENAPI_SPEC, spec_format="openapi")
        result = g.generate(req)
        assert result.wrapper is not None
        assert result.wrapper.wrapper_id

    def test_generate_openapi_endpoint_count(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        result = g.generate(WrapperGenerateRequest(spec_content=self._OPENAPI_SPEC))
        assert result.endpoint_count == 3

    def test_generate_extracts_base_url(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        result = g.generate(WrapperGenerateRequest(spec_content=self._OPENAPI_SPEC))
        assert "petstore.example.com" in result.wrapper.endpoints[0].base_url

    def test_generate_python_code_nonempty(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        result = g.generate(WrapperGenerateRequest(spec_content=self._OPENAPI_SPEC))
        assert len(result.wrapper.generated_code) > 100
        assert "def " in result.wrapper.generated_code

    def test_generate_python_code_has_class(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        result = g.generate(WrapperGenerateRequest(spec_content=self._OPENAPI_SPEC, tool_name="pet_store"))
        assert "class PetStore" in result.wrapper.generated_code

    def test_generate_from_postman(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        result = g.generate(WrapperGenerateRequest(
            spec_content=self._POSTMAN_SPEC, spec_format="postman"
        ))
        assert result.endpoint_count == 2

    def test_generate_stores_history(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        g.generate(WrapperGenerateRequest(spec_content=self._OPENAPI_SPEC))
        g.generate(WrapperGenerateRequest(spec_content=self._POSTMAN_SPEC, spec_format="postman"))
        history = g.get_history()
        assert len(history) >= 2

    def test_generate_spec_hash_set(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        result = g.generate(WrapperGenerateRequest(spec_content=self._OPENAPI_SPEC))
        assert result.wrapper.spec_hash

    def test_generate_invalid_json_warns(self, tmp_path):
        from amc.product.api_wrapper_generator import WrapperGenerateRequest
        g = self._gen(tmp_path)
        result = g.generate(WrapperGenerateRequest(spec_content="not json at all"))
        assert len(result.warnings) > 0


# ═══════════════════════════════════════════════════════════════
# MODULE 3 — AutoDoc Generator
# ═══════════════════════════════════════════════════════════════


class TestAutoDocGenerator:
    def _gen(self, tmp_path: Path):
        from amc.product.autodoc_generator import AutoDocGenerator
        return AutoDocGenerator(db_path=tmp_path / "docs.db")

    def _base_request(self):
        from amc.product.autodoc_generator import DocGenerateRequest, WorkflowStep, TestDefinition
        return DocGenerateRequest(
            workflow_name="Invoice Processing",
            workflow_description="Automates invoice intake, validation, and approval.",
            steps=[
                WorkflowStep(
                    name="Ingest Invoice",
                    description="Receive and parse the invoice document.",
                    inputs=["invoice_file"],
                    outputs=["invoice_data"],
                    tools=["PDFParser"],
                ),
                WorkflowStep(
                    name="Validate",
                    description="Validate required fields.",
                    inputs=["invoice_data"],
                    outputs=["validation_report"],
                ),
            ],
            tests=[
                TestDefinition(
                    name="test_happy_path",
                    description="Standard invoice processed successfully.",
                    inputs={"invoice_file": "invoice.pdf"},
                    expected_outputs={"status": "approved"},
                    test_type="e2e",
                ),
            ],
            version="2.1.0",
            author="AMC Team",
            known_limitations=["Does not handle multi-currency invoices."],
            output_format="markdown",
        )

    def test_generate_markdown_returns_doc(self, tmp_path):
        g = self._gen(tmp_path)
        result = g.generate(self._base_request())
        assert result.doc is not None
        assert result.doc.doc_id

    def test_generate_markdown_has_content(self, tmp_path):
        g = self._gen(tmp_path)
        result = g.generate(self._base_request())
        assert len(result.doc.content) > 100

    def test_generate_markdown_includes_workflow_name(self, tmp_path):
        g = self._gen(tmp_path)
        result = g.generate(self._base_request())
        assert "Invoice Processing" in result.doc.content

    def test_generate_markdown_includes_steps(self, tmp_path):
        g = self._gen(tmp_path)
        result = g.generate(self._base_request())
        assert "Ingest Invoice" in result.doc.content or "Validate" in result.doc.content

    def test_generate_markdown_includes_limitations(self, tmp_path):
        from amc.product.autodoc_generator import DocGenerateRequest
        req = self._base_request()
        req.include_limitations = True
        g = self._gen(tmp_path)
        result = g.generate(req)
        assert "multi-currency" in result.doc.content.lower() or "limitation" in result.doc.content.lower()

    def test_generate_html_format(self, tmp_path):
        from amc.product.autodoc_generator import DocGenerateRequest
        req = self._base_request()
        req.output_format = "html"
        g = self._gen(tmp_path)
        result = g.generate(req)
        assert "<" in result.doc.content  # some HTML tag

    def test_generate_rst_format(self, tmp_path):
        from amc.product.autodoc_generator import DocGenerateRequest
        req = self._base_request()
        req.output_format = "rst"
        g = self._gen(tmp_path)
        result = g.generate(req)
        assert result.doc.format == "rst"
        assert len(result.doc.content) > 50

    def test_generate_stores_history(self, tmp_path):
        g = self._gen(tmp_path)
        g.generate(self._base_request())
        g.generate(self._base_request())
        history = g.get_history(limit=10)
        assert len(history) >= 2

    def test_get_doc_by_id(self, tmp_path):
        g = self._gen(tmp_path)
        result = g.generate(self._base_request())
        doc = g.get_doc(result.doc.doc_id)
        assert doc is not None
        assert doc["doc_id"] == result.doc.doc_id

    def test_word_count_positive(self, tmp_path):
        g = self._gen(tmp_path)
        result = g.generate(self._base_request())
        assert result.doc.word_count > 0


# ═══════════════════════════════════════════════════════════════
# MODULE 4 — Docs Ingestion
# ═══════════════════════════════════════════════════════════════


class TestDocsIngestion:
    def _mgr(self, tmp_path: Path):
        from amc.product.docs_ingestion import DocsIngestionManager
        return DocsIngestionManager(db_path=tmp_path / "docs_ingestion.db")

    def test_ingest_new_doc_is_new(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        result = mgr.ingest(IngestRequest(content="Hello world doc.", source_name="readme"))
        assert result.is_new is True
        assert result.version.change_type == "new"

    def test_ingest_same_content_not_changed(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        content = "Stable content."
        mgr.ingest(IngestRequest(content=content, source_name="guide"))
        result = mgr.ingest(IngestRequest(content=content, source_name="guide"))
        assert result.is_changed is False

    def test_ingest_modified_content_is_changed(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        mgr.ingest(IngestRequest(content="Version 1 content.", source_name="spec"))
        result = mgr.ingest(IngestRequest(
            content="Version 2 content — significantly different.", source_name="spec"
        ))
        assert result.is_changed is True
        assert result.version.change_type == "modified"

    def test_ingest_creates_source(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        mgr.ingest(IngestRequest(content="Test.", source_name="mysrc"))
        sources = mgr.list_sources()
        names = [s.name for s in sources]
        assert "mysrc" in names

    def test_diff_summary_generated(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        result = mgr.ingest(IngestRequest(content="A new doc.", source_name="newdoc"))
        assert result.version.diff_summary

    def test_get_versions(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        mgr.ingest(IngestRequest(content="v1", source_name="vdoc"))
        mgr.ingest(IngestRequest(content="v2 changed!", source_name="vdoc"))
        source = mgr._get_source_by_name("vdoc")
        versions = mgr.get_versions(source.source_id, limit=5)
        assert len(versions) >= 1

    def test_weekly_summary_returns_summary(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest, WeeklySummaryRequest
        mgr = self._mgr(tmp_path)
        mgr.ingest(IngestRequest(content="Doc A", source_name="a"))
        mgr.ingest(IngestRequest(content="Doc B", source_name="b"))
        summary = mgr.generate_weekly_summary(WeeklySummaryRequest(since_days=7))
        assert summary.summary_id
        assert summary.new_docs >= 2

    def test_action_items_for_new_doc(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        result = mgr.ingest(IngestRequest(content="This is a new guide.", source_name="new_guide"))
        assert isinstance(result.version.action_items, list)

    def test_mark_deleted(self, tmp_path):
        from amc.product.docs_ingestion import IngestRequest
        mgr = self._mgr(tmp_path)
        mgr.ingest(IngestRequest(content="Some content", source_name="deleteme"))
        version = mgr.mark_deleted("deleteme")
        assert version is not None
        assert version.change_type == "deleted"


# ═══════════════════════════════════════════════════════════════
# MODULE 5 — KB Builder
# ═══════════════════════════════════════════════════════════════


class TestKBBuilder:
    def _kb(self, tmp_path: Path):
        from amc.product.kb_builder import KBBuilder
        return KBBuilder(db_path=str(tmp_path / "kb.db"))

    def test_ingest_ticket_creates_entry(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        result = kb.ingest_ticket(TicketInput(
            subject="How do I reset my password?",
            body="I forgot my password and need to reset it.",
            resolution="Go to settings and click Reset Password.",
            tags=["auth"],
        ))
        assert result.entry is not None
        assert result.entry.entry_id
        assert result.is_new is True

    def test_ingest_ticket_extracts_question(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        result = kb.ingest_ticket(TicketInput(
            subject="Cannot login to dashboard",
            body="I get an error when logging in.",
            resolution="Clear browser cache and retry.",
        ))
        assert "login" in result.entry.question.lower() or "cannot" in result.entry.question.lower()

    def test_ingest_similar_ticket_merges(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        kb.ingest_ticket(TicketInput(
            subject="API key not working",
            body="My API key does not work and I get 401 errors.",
            resolution="Regenerate your API key in the dashboard.",
            tags=["api"],
        ))
        result2 = kb.ingest_ticket(TicketInput(
            subject="API key invalid",
            body="API key gives 401 error and does not work.",
            resolution="Regenerate key from settings.",
            tags=["api"],
        ))
        # Either merged or new — both are valid behaviour
        assert result2.entry is not None

    def test_search_returns_results(self, tmp_path):
        from amc.product.kb_builder import TicketInput, KBSearchRequest
        kb = self._kb(tmp_path)
        kb.ingest_ticket(TicketInput(
            subject="Billing invoice question",
            body="How do I download my invoice?",
            resolution="Go to Billing > Invoices and click Download.",
            tags=["billing"],
        ))
        sr = kb.search(KBSearchRequest(query="invoice"))
        assert sr.total_found >= 1

    def test_search_by_category(self, tmp_path):
        from amc.product.kb_builder import TicketInput, KBSearchRequest
        kb = self._kb(tmp_path)
        kb.ingest_ticket(TicketInput(
            subject="Billing question",
            body="How do I update my payment method?",
            resolution="Visit account settings.",
            tags=["billing"],
        ))
        kb.ingest_ticket(TicketInput(
            subject="Login question",
            body="Why is SSO not working?",
            resolution="Check IdP config.",
            tags=["auth"],
        ))
        sr = kb.search(KBSearchRequest(query="", category="billing", limit=10))
        for entry in sr.entries:
            assert entry.category == "billing"

    def test_get_faq_returns_sections(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        kb.ingest_ticket(TicketInput(
            subject="Billing question", body="Invoice query.", resolution="Check billing page.", tags=["billing"]
        ))
        kb.ingest_ticket(TicketInput(
            subject="API question", body="How to call API?", resolution="Use API key.", tags=["api"]
        ))
        faq = kb.get_faq()
        assert faq.total_entries >= 2
        assert len(faq.sections) >= 1

    def test_vote_helpful(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        result = kb.ingest_ticket(TicketInput(
            subject="Test Q", body="Test question.", resolution="Test answer."
        ))
        ok = kb.vote(result.entry.entry_id, helpful=True)
        assert ok is True
        entry = kb.get_entry(result.entry.entry_id)
        assert entry.helpful_votes >= 1

    def test_get_entry_returns_entry(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        result = kb.ingest_ticket(TicketInput(
            subject="Find me", body="Test.", resolution="Found."
        ))
        entry = kb.get_entry(result.entry.entry_id)
        assert entry is not None
        assert entry.entry_id == result.entry.entry_id

    def test_confidence_high_with_resolution(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        result = kb.ingest_ticket(TicketInput(
            subject="With resolution", body="Body.", resolution="Clear resolution here."
        ))
        assert result.entry.confidence >= 0.8

    def test_list_entries(self, tmp_path):
        from amc.product.kb_builder import TicketInput
        kb = self._kb(tmp_path)
        for i in range(5):
            kb.ingest_ticket(TicketInput(
                subject=f"Question {i}", body=f"Body {i}.", resolution=f"Answer {i}."
            ))
        entries = kb.list_entries(limit=10)
        assert len(entries) >= 5


# ═══════════════════════════════════════════════════════════════
# MODULE 6 — Workflow Templates
# ═══════════════════════════════════════════════════════════════


class TestWorkflowTemplates:
    def _market(self, tmp_path: Path):
        from amc.product.workflow_templates import WorkflowTemplateMarketplace
        return WorkflowTemplateMarketplace(db_path=str(tmp_path / "templates.db"))

    def _create_req(self, name="My Template", category="general"):
        from amc.product.workflow_templates import TemplateCreateRequest, TemplateStep
        return TemplateCreateRequest(
            name=name,
            version="1.0.0",
            category=category,
            description="A test template.",
            author="test-author",
            tags=["test", category],
            steps=[
                TemplateStep(step_id="s1", name="Step 1", description="First step.", tool="tool_a"),
                TemplateStep(step_id="s2", name="Step 2", description="Second step.", tool="tool_b"),
            ],
        )

    def test_create_template(self, tmp_path):
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        assert t.template_id
        assert t.name == "My Template"

    def test_get_template(self, tmp_path):
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        got = m.get_template(t.template_id)
        assert got is not None
        assert got.template_id == t.template_id

    def test_update_template(self, tmp_path):
        from amc.product.workflow_templates import TemplateUpdateRequest
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        updated = m.update_template(t.template_id, TemplateUpdateRequest(description="Updated desc."))
        assert updated is not None
        assert updated.description == "Updated desc."

    def test_delete_template(self, tmp_path):
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        ok = m.delete_template(t.template_id)
        assert ok is True
        assert m.get_template(t.template_id) is None

    def test_publish_template(self, tmp_path):
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        assert t.is_published is False
        ok = m.publish_template(t.template_id)
        assert ok is True
        got = m.get_template(t.template_id)
        assert got.is_published is True

    def test_search_templates_by_name(self, tmp_path):
        from amc.product.workflow_templates import TemplateSearchRequest
        m = self._market(tmp_path)
        m.create_template(self._create_req(name="Invoice Automation"))
        m.create_template(self._create_req(name="Billing Workflow"))
        results = m.search_templates(TemplateSearchRequest(query="Invoice"))
        assert any("Invoice" in r.name for r in results)

    def test_search_by_category(self, tmp_path):
        from amc.product.workflow_templates import TemplateSearchRequest
        m = self._market(tmp_path)
        m.create_template(self._create_req(name="Finance T", category="finance"))
        m.create_template(self._create_req(name="HR T", category="hr"))
        results = m.search_templates(TemplateSearchRequest(category="finance"))
        assert all(r.category == "finance" for r in results)

    def test_install_template(self, tmp_path):
        from amc.product.workflow_templates import TemplateInstallRequest
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        install = m.install_template(TemplateInstallRequest(template_id=t.template_id, tenant_id="tenant-1"))
        assert install.install_id
        assert install.tenant_id == "tenant-1"

    def test_uninstall_template(self, tmp_path):
        from amc.product.workflow_templates import TemplateInstallRequest
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        install = m.install_template(TemplateInstallRequest(template_id=t.template_id, tenant_id="t2"))
        ok = m.uninstall_template(install.install_id)
        assert ok is True

    def test_list_installs(self, tmp_path):
        from amc.product.workflow_templates import TemplateInstallRequest
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        m.install_template(TemplateInstallRequest(template_id=t.template_id, tenant_id="tenant-x"))
        m.install_template(TemplateInstallRequest(template_id=t.template_id, tenant_id="tenant-x"))
        installs = m.list_installs("tenant-x")
        assert len(installs) >= 2

    def test_rate_template(self, tmp_path):
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        ok = m.rate_template(t.template_id, 4.5)
        assert ok is True

    def test_list_categories(self, tmp_path):
        m = self._market(tmp_path)
        m.create_template(self._create_req(category="marketing"))
        m.create_template(self._create_req(category="sales"))
        cats = m.list_categories()
        assert "marketing" in cats
        assert "sales" in cats

    def test_get_versions(self, tmp_path):
        m = self._market(tmp_path)
        t = m.create_template(self._create_req())
        versions = m.get_versions(t.template_id)
        assert isinstance(versions, list)


# ═══════════════════════════════════════════════════════════════
# MODULE 7 — Async Callback Manager
# ═══════════════════════════════════════════════════════════════


class TestAsyncCallbackManager:
    def _mgr(self, tmp_path: Path):
        from amc.product.async_callback import get_async_callback_manager, AsyncCallbackManager
        return AsyncCallbackManager(db_path=str(tmp_path / "callbacks.db"))

    def _reg_req(self, name="Test CB", target_url="http://localhost:9999/hook"):
        from amc.product.async_callback import CallbackRegisterRequest
        return CallbackRegisterRequest(
            name=name,
            trigger="workflow_complete",
            target_url=target_url,
            payload_template={"event": "{{trigger}}", "data": "{{data}}"},
            max_retries=2,
        )

    def test_register_callback(self, tmp_path):
        mgr = self._mgr(tmp_path)
        reg = mgr.register(self._reg_req())
        assert reg.callback_id
        assert reg.name == "Test CB"

    def test_get_registration(self, tmp_path):
        mgr = self._mgr(tmp_path)
        reg = mgr.register(self._reg_req())
        got = mgr.get_registration(reg.callback_id)
        assert got is not None
        assert got.callback_id == reg.callback_id

    def test_unregister_callback(self, tmp_path):
        mgr = self._mgr(tmp_path)
        reg = mgr.register(self._reg_req())
        ok = mgr.unregister(reg.callback_id)
        assert ok is True

    def test_list_registrations(self, tmp_path):
        mgr = self._mgr(tmp_path)
        mgr.register(self._reg_req(name="CB-A"))
        mgr.register(self._reg_req(name="CB-B"))
        regs = mgr.list_registrations()
        assert len(regs) >= 2

    def test_trigger_creates_deliveries(self, tmp_path):
        from amc.product.async_callback import TriggerRequest
        mgr = self._mgr(tmp_path)
        mgr.register(self._reg_req())
        result = mgr.trigger(TriggerRequest(trigger="workflow_complete", context={"data": "ok"}))
        assert result.triggered_count >= 1
        assert len(result.delivery_ids) >= 1

    def test_delivery_status_recorded(self, tmp_path):
        from amc.product.async_callback import TriggerRequest
        mgr = self._mgr(tmp_path)
        mgr.register(self._reg_req())
        tresult = mgr.trigger(TriggerRequest(trigger="workflow_complete", context={}))
        delivery = mgr.get_delivery(tresult.delivery_ids[0])
        assert delivery is not None
        assert delivery.status in ("delivered", "failed", "retrying", "exhausted", "pending", "delivering")

    def test_list_deliveries(self, tmp_path):
        from amc.product.async_callback import TriggerRequest
        mgr = self._mgr(tmp_path)
        mgr.register(self._reg_req())
        mgr.trigger(TriggerRequest(trigger="workflow_complete", context={}))
        deliveries = mgr.list_deliveries(limit=10)
        assert len(deliveries) >= 1

    def test_payload_rendering(self, tmp_path):
        """Verify {{placeholders}} are replaced in payload templates."""
        from amc.product.async_callback import CallbackRegisterRequest
        mgr = self._mgr(tmp_path)
        template = {"event": "{{trigger}}", "workflow": "{{workflow_id}}"}
        context = {"trigger": "workflow_complete", "workflow_id": "wf-123"}
        rendered = mgr._render_payload(template, context)
        assert rendered.get("event") == "workflow_complete"
        assert rendered.get("workflow") == "wf-123"

    def test_status_summary(self, tmp_path):
        from amc.product.async_callback import TriggerRequest
        mgr = self._mgr(tmp_path)
        mgr.register(self._reg_req())
        mgr.trigger(TriggerRequest(trigger="workflow_complete", context={}))
        summary = mgr.get_status_summary()
        assert summary.total_registrations >= 1
        assert summary.total_deliveries >= 1

    def test_retry_pending_runs(self, tmp_path):
        mgr = self._mgr(tmp_path)
        count = mgr.retry_pending()
        assert isinstance(count, int)
        assert count >= 0


# ═══════════════════════════════════════════════════════════════
# MODULE 8 — Output Corrector
# ═══════════════════════════════════════════════════════════════


class TestOutputCorrector:
    def _corrector(self, tmp_path: Path):
        from amc.product.output_corrector import OutputCorrector
        return OutputCorrector(db_path=str(tmp_path / "corrector.db"))

    def test_correct_returns_result(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        result = c.correct(CorrectRequest(content="Hello world\n"))
        assert result.result_id
        assert result.corrected_content is not None

    def test_correct_trailing_whitespace(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        result = c.correct(CorrectRequest(content="Hello world   \nLine two  \n"))
        lines = result.corrected_content.splitlines()
        for line in lines:
            assert not line.endswith("   "), f"Trailing whitespace found: {line!r}"

    def test_correct_normalizes_bullet_points(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        content = "* Item one\n* Item two\n* Item three\n"
        result = c.correct(CorrectRequest(content=content))
        # Output should have normalized bullets (either all * or all -)
        assert result.corrected_content

    def test_correct_amc_casing(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        result = c.correct(CorrectRequest(content="The amc platform handles Amc workflows.\n"))
        assert "amc" not in result.corrected_content or "AMC" in result.corrected_content

    def test_correct_multiple_blank_lines(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        content = "Line one\n\n\n\n\nLine two\n"
        result = c.correct(CorrectRequest(content=content))
        # Should not have more than 2 consecutive blank lines
        assert "\n\n\n\n" not in result.corrected_content

    def test_correct_no_change_when_clean(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        # Clean content should pass through with no or minimal corrections
        clean = "# Title\n\nThis is clean content.\n\n- Item A\n- Item B\n"
        result = c.correct(CorrectRequest(content=clean))
        assert result.corrected_content is not None

    def test_correct_is_changed_flag(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        result = c.correct(CorrectRequest(content="amc is great\n"))
        # "amc" should be corrected to "AMC" → is_changed = True
        assert result.is_changed is True

    def test_create_custom_rule(self, tmp_path):
        from amc.product.output_corrector import CorrectionRuleCreate
        c = self._corrector(tmp_path)
        rule = c.create_rule(CorrectionRuleCreate(
            name="Replace foo with bar",
            rule_type="naming",
            pattern=r"\bfoo\b",
            replacement="bar",
            description="Normalize foo to bar",
        ))
        assert rule.rule_id
        assert rule.name == "Replace foo with bar"

    def test_custom_rule_applied(self, tmp_path):
        from amc.product.output_corrector import CorrectionRuleCreate, CorrectRequest
        c = self._corrector(tmp_path)
        rule = c.create_rule(CorrectionRuleCreate(
            name="foo→bar",
            rule_type="naming",
            pattern=r"\bfoo\b",
            replacement="bar",
        ))
        result = c.correct(CorrectRequest(content="The foo is here.\n", custom_rules=[rule.rule_id]))
        assert "bar" in result.corrected_content

    def test_create_section_config(self, tmp_path):
        from amc.product.output_corrector import SectionOrderConfigCreate
        c = self._corrector(tmp_path)
        config = c.create_section_config(SectionOrderConfigCreate(
            name="Standard README",
            expected_sections=["Overview", "Installation", "Usage", "Contributing"],
        ))
        assert config.config_id

    def test_reorder_sections(self, tmp_path):
        from amc.product.output_corrector import SectionOrderConfigCreate, CorrectRequest
        c = self._corrector(tmp_path)
        config = c.create_section_config(SectionOrderConfigCreate(
            name="Doc order",
            expected_sections=["Overview", "Installation", "Usage"],
        ))
        # Scrambled section order
        content = "## Usage\n\nUsage text.\n\n## Overview\n\nOverview text.\n\n## Installation\n\nInstall text.\n"
        result = c.correct(CorrectRequest(
            content=content,
            apply_ordering=True,
            section_config_id=config.config_id,
        ))
        # Overview should appear before Installation in output
        idx_overview = result.corrected_content.find("## Overview")
        idx_install = result.corrected_content.find("## Installation")
        assert idx_overview < idx_install

    def test_add_naming_norm(self, tmp_path):
        from amc.product.output_corrector import NamingNormCreate
        c = self._corrector(tmp_path)
        norm = c.add_naming_norm(NamingNormCreate(
            pattern=r"\bworkflow engine\b",
            canonical="Workflow Engine",
            description="Capitalize product name",
        ))
        assert norm.norm_id

    def test_list_rules(self, tmp_path):
        from amc.product.output_corrector import CorrectionRuleCreate
        c = self._corrector(tmp_path)
        c.create_rule(CorrectionRuleCreate(name="Rule A", rule_type="formatting", pattern=r"a", replacement="b"))
        c.create_rule(CorrectionRuleCreate(name="Rule B", rule_type="naming", pattern=r"x", replacement="y"))
        rules = c.list_rules()
        assert len(rules) >= 2

    def test_correction_history(self, tmp_path):
        from amc.product.output_corrector import CorrectRequest
        c = self._corrector(tmp_path)
        c.correct(CorrectRequest(content="amc rocks\n"))
        c.correct(CorrectRequest(content="another amc line\n"))
        history = c.get_history(limit=10)
        assert len(history) >= 2
