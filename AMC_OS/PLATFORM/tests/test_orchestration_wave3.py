"""Tests for AMC Wave-3 product modules.

Covers:
  - knowledge_graph    (Module 7): Entity/Relationship CRUD, traversal, stats
  - document_assembler (Module 8): Template/Assembly/Section/Artifact CRUD,
                                   TOC, document assembly, formatting
  - batch_processor    (Module 9): Batch lifecycle, item claiming, results

All tests use in-memory SQLite (tmp_path fixture).
"""
from __future__ import annotations

import pytest
from pathlib import Path


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════


def _kg(tmp_path: Path):
    from amc.product.knowledge_graph import KnowledgeGraph
    return KnowledgeGraph(db_path=tmp_path / "kg.db")


def _da(tmp_path: Path):
    from amc.product.document_assembler import DocumentAssembler
    return DocumentAssembler(db_path=tmp_path / "docs.db")


def _bp(tmp_path: Path):
    from amc.product.batch_processor import BatchProcessor
    return BatchProcessor(db_path=tmp_path / "batch.db")


# ══════════════════════════════════════════════════════════════════════════════
# MODULE 7 — KnowledgeGraph
# ══════════════════════════════════════════════════════════════════════════════


class TestKnowledgeGraphEntities:
    """Entity CRUD."""

    def test_add_and_get_entity(self, tmp_path):
        kg = _kg(tmp_path)
        e = kg.add_entity("customer", "Acme Corp", {"tier": "gold"}, "t1")
        assert e.entity_id
        assert e.entity_type.value == "customer"
        assert e.name == "Acme Corp"
        assert e.properties == {"tier": "gold"}
        assert e.tenant_id == "t1"

        fetched = kg.get_entity(e.entity_id)
        assert fetched is not None
        assert fetched.entity_id == e.entity_id
        assert fetched.name == "Acme Corp"

    def test_get_entity_missing(self, tmp_path):
        kg = _kg(tmp_path)
        assert kg.get_entity("does-not-exist") is None

    def test_find_entities_by_type(self, tmp_path):
        kg = _kg(tmp_path)
        kg.add_entity("customer", "Alpha", tenant_id="t1")
        kg.add_entity("customer", "Beta",  tenant_id="t1")
        kg.add_entity("invoice",  "INV-1", tenant_id="t1")

        customers = kg.find_entities(entity_type="customer", tenant_id="t1")
        assert len(customers) == 2
        assert all(e.entity_type.value == "customer" for e in customers)

    def test_find_entities_by_name(self, tmp_path):
        kg = _kg(tmp_path)
        kg.add_entity("product", "Widget Pro",  tenant_id="t1")
        kg.add_entity("product", "Widget Lite", tenant_id="t1")
        kg.add_entity("product", "Gadget",      tenant_id="t1")

        results = kg.find_entities(name="Widget")
        assert len(results) == 2

    def test_update_entity(self, tmp_path):
        kg = _kg(tmp_path)
        e = kg.add_entity("contact", "John Doe", {"email": "j@x.com"})
        updated = kg.update_entity(e.entity_id, name="Jane Doe",
                                   properties={"email": "jane@x.com"})
        assert updated.name == "Jane Doe"
        assert updated.properties["email"] == "jane@x.com"

    def test_update_entity_not_found(self, tmp_path):
        kg = _kg(tmp_path)
        with pytest.raises(ValueError, match="Entity not found"):
            kg.update_entity("nonexistent", name="X")

    def test_delete_entity_cascades_relationships(self, tmp_path):
        kg = _kg(tmp_path)
        e1 = kg.add_entity("customer", "C1")
        e2 = kg.add_entity("contract", "K1")
        rel = kg.add_relationship(e1.entity_id, e2.entity_id, "has_contract")

        deleted = kg.delete_entity(e1.entity_id)
        assert deleted is True
        assert kg.get_entity(e1.entity_id) is None
        # Relationship should be gone too
        assert kg.get_relationship(rel.rel_id) is None

    def test_delete_entity_not_found(self, tmp_path):
        kg = _kg(tmp_path)
        assert kg.delete_entity("ghost") is False

    def test_entity_dict_property(self, tmp_path):
        kg = _kg(tmp_path)
        e  = kg.add_entity("task", "Deploy", {"env": "prod"})
        d  = e.dict
        assert d["entity_id"] == e.entity_id
        assert d["entity_type"] == "task"
        assert d["properties"]["env"] == "prod"

    def test_find_entities_limit(self, tmp_path):
        kg = _kg(tmp_path)
        for i in range(10):
            kg.add_entity("generic", f"Item {i}")
        results = kg.find_entities(entity_type="generic", limit=3)
        assert len(results) == 3


class TestKnowledgeGraphRelationships:
    """Relationship CRUD and traversal."""

    def test_add_and_get_relationship(self, tmp_path):
        kg = _kg(tmp_path)
        e1 = kg.add_entity("customer", "C1", tenant_id="t1")
        e2 = kg.add_entity("contract", "K1", tenant_id="t1")
        rel = kg.add_relationship(e1.entity_id, e2.entity_id, "has_contract",
                                   weight=2.0)
        assert rel.rel_id
        assert rel.from_entity_id == e1.entity_id
        assert rel.to_entity_id   == e2.entity_id
        assert rel.rel_type.value  == "has_contract"
        assert rel.weight          == 2.0

        fetched = kg.get_relationship(rel.rel_id)
        assert fetched is not None
        assert fetched.rel_id == rel.rel_id

    def test_get_relationship_missing(self, tmp_path):
        kg = _kg(tmp_path)
        assert kg.get_relationship("nope") is None

    def test_find_relationships_by_from(self, tmp_path):
        kg = _kg(tmp_path)
        e1 = kg.add_entity("customer", "C1")
        e2 = kg.add_entity("contract", "K1")
        e3 = kg.add_entity("invoice",  "I1")
        kg.add_relationship(e1.entity_id, e2.entity_id, "has_contract")
        kg.add_relationship(e1.entity_id, e3.entity_id, "references")

        rels = kg.find_relationships(from_entity_id=e1.entity_id)
        assert len(rels) == 2

    def test_find_relationships_by_type(self, tmp_path):
        kg = _kg(tmp_path)
        e1 = kg.add_entity("customer", "C1")
        e2 = kg.add_entity("contract", "K1")
        e3 = kg.add_entity("invoice",  "I1")
        kg.add_relationship(e1.entity_id, e2.entity_id, "has_contract")
        kg.add_relationship(e2.entity_id, e3.entity_id, "has_invoice")

        rels = kg.find_relationships(rel_type="has_invoice")
        assert len(rels) == 1
        assert rels[0].rel_type.value == "has_invoice"

    def test_delete_relationship(self, tmp_path):
        kg  = _kg(tmp_path)
        e1  = kg.add_entity("customer", "C1")
        e2  = kg.add_entity("contract", "K1")
        rel = kg.add_relationship(e1.entity_id, e2.entity_id, "owns")
        assert kg.delete_relationship(rel.rel_id) is True
        assert kg.get_relationship(rel.rel_id) is None

    def test_delete_relationship_not_found(self, tmp_path):
        kg = _kg(tmp_path)
        assert kg.delete_relationship("ghost") is False

    def test_relationship_dict(self, tmp_path):
        kg  = _kg(tmp_path)
        e1  = kg.add_entity("customer", "C1")
        e2  = kg.add_entity("invoice", "I1")
        rel = kg.add_relationship(e1.entity_id, e2.entity_id, "has_invoice",
                                   properties={"note": "q4"})
        d = rel.dict
        assert d["rel_type"] == "has_invoice"
        assert d["properties"]["note"] == "q4"


class TestKnowledgeGraphTraversal:
    """Graph traversal: neighbors, shortest path, subgraph."""

    def _setup_triangle(self, tmp_path):
        kg = _kg(tmp_path)
        c  = kg.add_entity("customer", "C1")
        k  = kg.add_entity("contract", "K1")
        i  = kg.add_entity("invoice",  "I1")
        kg.add_relationship(c.entity_id, k.entity_id, "has_contract")
        kg.add_relationship(k.entity_id, i.entity_id, "has_invoice")
        return kg, c, k, i

    def test_get_neighbors_outgoing(self, tmp_path):
        kg, c, k, i = self._setup_triangle(tmp_path)
        neighbors = kg.get_neighbors(c.entity_id, direction="out")
        ids = [e.entity_id for e in neighbors]
        assert k.entity_id in ids

    def test_get_neighbors_incoming(self, tmp_path):
        kg, c, k, i = self._setup_triangle(tmp_path)
        neighbors = kg.get_neighbors(k.entity_id, direction="in")
        ids = [e.entity_id for e in neighbors]
        assert c.entity_id in ids

    def test_get_neighbors_both_directions(self, tmp_path):
        kg, c, k, i = self._setup_triangle(tmp_path)
        neighbors = kg.get_neighbors(k.entity_id, direction="both")
        ids = [e.entity_id for e in neighbors]
        # k has c incoming and i outgoing
        assert c.entity_id in ids
        assert i.entity_id in ids

    def test_get_neighbors_with_rel_type_filter(self, tmp_path):
        kg = _kg(tmp_path)
        c  = kg.add_entity("customer", "C1")
        k  = kg.add_entity("contract", "K1")
        i  = kg.add_entity("invoice",  "I1")
        kg.add_relationship(c.entity_id, k.entity_id, "has_contract")
        kg.add_relationship(c.entity_id, i.entity_id, "references")

        neighbors = kg.get_neighbors(c.entity_id, rel_type="has_contract", direction="out")
        assert len(neighbors) == 1
        assert neighbors[0].entity_id == k.entity_id

    def test_shortest_path_direct(self, tmp_path):
        kg, c, k, i = self._setup_triangle(tmp_path)
        path = kg.shortest_path(c.entity_id, k.entity_id)
        assert path is not None
        assert path.length == 1
        assert path.nodes == [c.entity_id, k.entity_id]

    def test_shortest_path_two_hops(self, tmp_path):
        kg, c, k, i = self._setup_triangle(tmp_path)
        path = kg.shortest_path(c.entity_id, i.entity_id)
        assert path is not None
        assert path.length == 2
        assert path.nodes[0] == c.entity_id
        assert path.nodes[-1] == i.entity_id

    def test_shortest_path_same_node(self, tmp_path):
        kg = _kg(tmp_path)
        e  = kg.add_entity("customer", "C1")
        path = kg.shortest_path(e.entity_id, e.entity_id)
        assert path is not None
        assert path.length == 0

    def test_shortest_path_not_found(self, tmp_path):
        kg = _kg(tmp_path)
        e1 = kg.add_entity("customer", "C1")
        e2 = kg.add_entity("invoice",  "I1")
        path = kg.shortest_path(e1.entity_id, e2.entity_id, max_depth=3)
        assert path is None

    def test_shortest_path_dict(self, tmp_path):
        kg, c, k, i = self._setup_triangle(tmp_path)
        path = kg.shortest_path(c.entity_id, k.entity_id)
        d    = path.dict
        assert "nodes" in d
        assert "length" in d
        assert "total_weight" in d

    def test_get_subgraph(self, tmp_path):
        kg, c, k, i = self._setup_triangle(tmp_path)
        sub = kg.get_subgraph(c.entity_id, depth=2)
        entity_ids = [e["entity_id"] for e in sub["entities"]]
        assert c.entity_id in entity_ids
        assert k.entity_id in entity_ids
        assert i.entity_id in entity_ids
        assert len(sub["relationships"]) >= 2

    def test_link_customer_contract_invoice(self, tmp_path):
        kg = _kg(tmp_path)
        c  = kg.add_entity("customer", "C1")
        k  = kg.add_entity("contract", "K1")
        i  = kg.add_entity("invoice",  "I1")
        result = kg.link_customer_contract_invoice(c.entity_id, k.entity_id, i.entity_id)
        assert "customer_to_contract" in result
        assert "contract_to_invoice"  in result
        assert result["customer_to_contract"]["rel_type"] == "has_contract"
        assert result["contract_to_invoice"]["rel_type"]  == "has_invoice"


class TestKnowledgeGraphQueries:
    """Query helpers and stats."""

    def test_query_by_type_chain(self, tmp_path):
        kg = _kg(tmp_path)
        c  = kg.add_entity("customer", "C1", tenant_id="t1")
        k  = kg.add_entity("contract", "K1", tenant_id="t1")
        i  = kg.add_entity("invoice",  "I1", tenant_id="t1")
        kg.add_relationship(c.entity_id, k.entity_id, "has_contract")
        kg.add_relationship(k.entity_id, i.entity_id, "has_invoice")

        paths = kg.query_by_type_chain(["customer", "contract", "invoice"],
                                        tenant_id="t1")
        assert len(paths) == 1
        assert paths[0]["path"][0]["entity_type"] == "customer"
        assert paths[0]["path"][-1]["entity_type"] == "invoice"

    def test_query_by_type_chain_empty(self, tmp_path):
        kg    = _kg(tmp_path)
        paths = kg.query_by_type_chain([])
        assert paths == []

    def test_get_graph_stats(self, tmp_path):
        kg = _kg(tmp_path)
        c  = kg.add_entity("customer", "C1", tenant_id="t1")
        k  = kg.add_entity("contract", "K1", tenant_id="t1")
        kg.add_relationship(c.entity_id, k.entity_id, "has_contract")

        stats = kg.get_graph_stats()
        assert stats["total_entities"] == 2
        assert stats["total_relationships"] == 1
        assert "customer" in stats["entities_by_type"]

    def test_get_graph_stats_by_tenant(self, tmp_path):
        kg = _kg(tmp_path)
        kg.add_entity("customer", "C1", tenant_id="t1")
        kg.add_entity("customer", "C2", tenant_id="t2")

        stats = kg.get_graph_stats(tenant_id="t1")
        assert stats["total_entities"] == 1
        assert stats["tenant_id"] == "t1"


# ══════════════════════════════════════════════════════════════════════════════
# MODULE 8 — DocumentAssembler
# ══════════════════════════════════════════════════════════════════════════════


class TestDocumentAssemblerTemplates:
    """Template CRUD."""

    def test_create_and_get_template(self, tmp_path):
        da = _da(tmp_path)
        sections = [
            {"title": "Introduction", "level": 1, "seq": 1},
            {"title": "Body",         "level": 1, "seq": 2},
        ]
        tmpl = da.create_template("Proposal", "Standard proposal", "markdown", sections)
        assert tmpl.template_id
        assert tmpl.name == "Proposal"
        assert len(tmpl.sections) == 2

        fetched = da.get_template(tmpl.template_id)
        assert fetched is not None
        assert fetched.template_id == tmpl.template_id

    def test_get_template_missing(self, tmp_path):
        da = _da(tmp_path)
        assert da.get_template("missing") is None

    def test_list_templates(self, tmp_path):
        da = _da(tmp_path)
        da.create_template("T1", "desc1", "markdown")
        da.create_template("T2", "desc2", "html")
        templates = da.list_templates()
        assert len(templates) == 2

    def test_template_dict(self, tmp_path):
        da   = _da(tmp_path)
        tmpl = da.create_template("T1", "desc")
        d    = tmpl.dict
        assert "template_id" in d
        assert d["name"] == "T1"


class TestDocumentAssemblerAssemblies:
    """Assembly CRUD."""

    def test_create_and_get_assembly(self, tmp_path):
        da = _da(tmp_path)
        asm = da.create_assembly("Q4 Report", output_format="markdown")
        assert asm.assembly_id
        assert asm.name == "Q4 Report"
        assert asm.status.value == "draft"
        assert asm.output_format.value == "markdown"

        fetched = da.get_assembly(asm.assembly_id)
        assert fetched is not None
        assert fetched.assembly_id == asm.assembly_id

    def test_create_assembly_from_template(self, tmp_path):
        da   = _da(tmp_path)
        tmpl = da.create_template("RFP", "rfp desc", sections=[
            {"title": "Intro",   "level": 1, "seq": 1},
            {"title": "Details", "level": 2, "seq": 2},
        ])
        asm  = da.create_assembly("RFP Asm", template_id=tmpl.template_id)
        sections = da.get_sections(asm.assembly_id)
        assert len(sections) == 2
        assert sections[0].title == "Intro"

    def test_get_assembly_missing(self, tmp_path):
        da = _da(tmp_path)
        assert da.get_assembly("nope") is None

    def test_list_assemblies(self, tmp_path):
        da = _da(tmp_path)
        da.create_assembly("A1")
        da.create_assembly("A2")
        assemblies = da.list_assemblies()
        assert len(assemblies) == 2

    def test_list_assemblies_by_status(self, tmp_path):
        da  = _da(tmp_path)
        a1  = da.create_assembly("A1")
        da.complete_assembly(a1.assembly_id)
        da.create_assembly("A2")

        drafts    = da.list_assemblies(status="draft")
        completed = da.list_assemblies(status="completed")
        assert len(drafts) == 1
        assert len(completed) == 1

    def test_complete_assembly(self, tmp_path):
        da  = _da(tmp_path)
        asm = da.create_assembly("Final")
        completed = da.complete_assembly(asm.assembly_id)
        assert completed.status.value == "completed"
        assert completed.completed_at is not None

    def test_assembly_dict(self, tmp_path):
        da  = _da(tmp_path)
        asm = da.create_assembly("MyDoc")
        d   = asm.dict
        assert "assembly_id" in d
        assert d["status"] == "draft"


class TestDocumentAssemblerSections:
    """Section CRUD and word counts."""

    def _asm(self, tmp_path):
        da  = _da(tmp_path)
        asm = da.create_assembly("Test Doc")
        return da, asm

    def test_add_and_get_section(self, tmp_path):
        da, asm = self._asm(tmp_path)
        sec = da.add_section(asm.assembly_id, "Intro", seq=1, level=1,
                             content="Hello world")
        assert sec.section_id
        assert sec.title == "Intro"
        assert sec.word_count == 2
        assert sec.status.value == "drafted"

    def test_add_empty_section(self, tmp_path):
        da, asm = self._asm(tmp_path)
        sec = da.add_section(asm.assembly_id, "Placeholder", seq=1, level=1)
        assert sec.status.value == "empty"
        assert sec.word_count == 0

    def test_update_section_content(self, tmp_path):
        da, asm = self._asm(tmp_path)
        sec = da.add_section(asm.assembly_id, "Intro", seq=1, level=1)
        updated = da.update_section(sec.section_id, content="New content here",
                                    status="drafted")
        assert updated.content == "New content here"
        assert updated.word_count == 3
        assert updated.status.value == "drafted"

    def test_update_section_not_found(self, tmp_path):
        da, asm = self._asm(tmp_path)
        with pytest.raises(ValueError, match="Section not found"):
            da.update_section("ghost", content="x")

    def test_get_sections_ordered(self, tmp_path):
        da, asm = self._asm(tmp_path)
        da.add_section(asm.assembly_id, "C", seq=3, level=1)
        da.add_section(asm.assembly_id, "A", seq=1, level=1)
        da.add_section(asm.assembly_id, "B", seq=2, level=1)
        sections = da.get_sections(asm.assembly_id)
        assert [s.seq for s in sections] == [1, 2, 3]

    def test_get_word_counts(self, tmp_path):
        da, asm = self._asm(tmp_path)
        da.add_section(asm.assembly_id, "S1", seq=1, level=1, content="one two three")
        da.add_section(asm.assembly_id, "S2", seq=2, level=1, content="four five")
        wc = da.get_word_counts(asm.assembly_id)
        assert wc["total_words"] == 5
        assert wc["section_count"] == 2
        assert len(wc["per_section"]) == 2

    def test_section_dict(self, tmp_path):
        da, asm = self._asm(tmp_path)
        sec = da.add_section(asm.assembly_id, "S1", seq=1, level=2,
                             content="hello")
        d = sec.dict
        assert d["title"] == "S1"
        assert d["level"] == 2
        assert d["word_count"] == 1


class TestDocumentAssemblerArtifacts:
    """Artifact CRUD."""

    def test_add_and_get_artifact(self, tmp_path):
        da, asm = _da(tmp_path), None
        da = _da(tmp_path)
        asm = da.create_assembly("Doc")
        sec = da.add_section(asm.assembly_id, "Intro", seq=1, level=1)

        art = da.add_artifact(asm.assembly_id, sec.section_id,
                              "image", "base64data", source_url="http://img.test")
        assert art.artifact_id
        assert art.artifact_type == "image"
        assert art.source_url == "http://img.test"
        assert art.fetched_at is not None

    def test_get_artifacts_by_assembly(self, tmp_path):
        da  = _da(tmp_path)
        asm = da.create_assembly("Doc")
        da.add_artifact(asm.assembly_id, None, "text", "content A")
        da.add_artifact(asm.assembly_id, None, "text", "content B")
        arts = da.get_artifacts(assembly_id=asm.assembly_id)
        assert len(arts) == 2

    def test_get_artifacts_by_section(self, tmp_path):
        da  = _da(tmp_path)
        asm = da.create_assembly("Doc")
        s1  = da.add_section(asm.assembly_id, "S1", seq=1, level=1)
        s2  = da.add_section(asm.assembly_id, "S2", seq=2, level=1)
        da.add_artifact(asm.assembly_id, s1.section_id, "code", "print('hi')")
        da.add_artifact(asm.assembly_id, s2.section_id, "code", "x = 1")
        arts = da.get_artifacts(section_id=s1.section_id)
        assert len(arts) == 1
        assert arts[0].content == "print('hi')"

    def test_artifact_dict(self, tmp_path):
        da  = _da(tmp_path)
        asm = da.create_assembly("Doc")
        art = da.add_artifact(asm.assembly_id, None, "note", "my note")
        d   = art.dict
        assert d["artifact_type"] == "note"
        assert d["content"] == "my note"


class TestDocumentAssemblerTOCAndAssembly:
    """TOC generation and document assembly."""

    def _full_doc(self, tmp_path):
        da  = _da(tmp_path)
        asm = da.create_assembly("Full Doc")
        da.add_section(asm.assembly_id, "Introduction", seq=1, level=1,
                       content="Welcome to this document.")
        da.add_section(asm.assembly_id, "Section 1.1", seq=2, level=2,
                       content="Sub content here.")
        da.add_section(asm.assembly_id, "Conclusion", seq=3, level=1,
                       content="The end.")
        return da, asm

    def test_generate_toc(self, tmp_path):
        da, asm = self._full_doc(tmp_path)
        toc = da.generate_toc(asm.assembly_id)
        assert len(toc) == 3
        assert toc[0]["title"] == "Introduction"
        assert toc[1]["level"] == 2
        assert all("section_id" in entry for entry in toc)

    def test_assemble_document(self, tmp_path):
        da, asm = self._full_doc(tmp_path)
        doc = da.assemble_document(asm.assembly_id)
        assert "Table of Contents" in doc
        assert "Introduction" in doc
        assert "Conclusion" in doc
        assert "Welcome to this document." in doc

    def test_assemble_document_toc_first(self, tmp_path):
        da, asm = self._full_doc(tmp_path)
        doc = da.assemble_document(asm.assembly_id)
        toc_pos  = doc.index("Table of Contents")
        intro_pos = doc.index("Welcome to this document.")
        assert toc_pos < intro_pos

    def test_format_section_markdown(self, tmp_path):
        from amc.product.document_assembler import OutputFormat
        da, asm = self._full_doc(tmp_path)
        sections = da.get_sections(asm.assembly_id)
        sec = sections[0]
        formatted = da.format_section(sec, OutputFormat.MARKDOWN)
        assert formatted.startswith("#")
        assert "Introduction" in formatted

    def test_format_section_html(self, tmp_path):
        from amc.product.document_assembler import OutputFormat
        da, asm = self._full_doc(tmp_path)
        sections = da.get_sections(asm.assembly_id)
        sec = sections[0]  # level=1
        formatted = da.format_section(sec, OutputFormat.HTML)
        assert "<h1>" in formatted
        assert "</h1>" in formatted

    def test_format_section_json(self, tmp_path):
        import json
        from amc.product.document_assembler import OutputFormat
        da, asm = self._full_doc(tmp_path)
        sections = da.get_sections(asm.assembly_id)
        formatted = da.format_section(sections[0], OutputFormat.JSON)
        parsed = json.loads(formatted)
        assert parsed["title"] == "Introduction"

    def test_assemble_not_found(self, tmp_path):
        da = _da(tmp_path)
        with pytest.raises(ValueError, match="Assembly not found"):
            da.assemble_document("ghost")


# ══════════════════════════════════════════════════════════════════════════════
# MODULE 9 — BatchProcessor
# ══════════════════════════════════════════════════════════════════════════════


class TestBatchProcessorCRUD:
    """Batch and item CRUD."""

    def test_create_and_get_batch(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("Import Job", concurrency_limit=3, priority=1)
        assert b.batch_id
        assert b.name == "Import Job"
        assert b.status.value == "pending"
        assert b.concurrency_limit == 3
        assert b.priority == 1

        fetched = bp.get_batch(b.batch_id)
        assert fetched is not None
        assert fetched.batch_id == b.batch_id

    def test_get_batch_missing(self, tmp_path):
        bp = _bp(tmp_path)
        assert bp.get_batch("ghost") is None

    def test_list_batches(self, tmp_path):
        bp = _bp(tmp_path)
        bp.create_batch("B1")
        bp.create_batch("B2")
        batches = bp.list_batches()
        assert len(batches) == 2

    def test_list_batches_by_status(self, tmp_path):
        bp = _bp(tmp_path)
        b1 = bp.create_batch("B1")
        bp.start_batch(b1.batch_id)
        bp.create_batch("B2")

        running = bp.list_batches(status="running")
        pending = bp.list_batches(status="pending")
        assert len(running) == 1
        assert len(pending) == 1

    def test_list_batches_limit(self, tmp_path):
        bp = _bp(tmp_path)
        for i in range(10):
            bp.create_batch(f"B{i}")
        batches = bp.list_batches(limit=4)
        assert len(batches) == 4

    def test_batch_dict(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B1", metadata={"env": "prod"})
        d  = b.dict
        assert d["name"] == "B1"
        assert d["metadata"]["env"] == "prod"

    def test_add_item(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B1")
        item = bp.add_item(b.batch_id, {"record_id": 42})
        assert item.item_id
        assert item.status.value == "pending"
        assert item.payload == {"record_id": 42}

    def test_add_item_updates_total(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B1")
        bp.add_item(b.batch_id, {"x": 1})
        bp.add_item(b.batch_id, {"x": 2})
        b2 = bp.get_batch(b.batch_id)
        assert b2.total_items == 2

    def test_add_items_bulk(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("Bulk")
        payloads = [{"i": i} for i in range(5)]
        items = bp.add_items(b.batch_id, payloads)
        assert len(items) == 5
        seqs = [i.seq for i in items]
        assert seqs == sorted(seqs)
        b2 = bp.get_batch(b.batch_id)
        assert b2.total_items == 5

    def test_get_item(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        it = bp.add_item(b.batch_id, {"k": "v"})
        fetched = bp.get_item(it.item_id)
        assert fetched is not None
        assert fetched.payload == {"k": "v"}

    def test_get_item_missing(self, tmp_path):
        bp = _bp(tmp_path)
        assert bp.get_item("ghost") is None

    def test_get_items_by_status(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        i1 = bp.add_item(b.batch_id, {"a": 1})
        bp.add_item(b.batch_id, {"b": 2})
        bp.start_batch(b.batch_id)
        claimed = bp.claim_items(b.batch_id, worker_id="w1", count=1)
        assert len(claimed) == 1

        running = bp.get_items(b.batch_id, status="running")
        assert len(running) == 1

    def test_item_dict(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        it = bp.add_item(b.batch_id, {"key": "val"})
        d  = it.dict
        assert d["payload"] == {"key": "val"}
        assert d["status"] == "pending"


class TestBatchProcessorLifecycle:
    """Batch lifecycle: start, pause, resume, cancel."""

    def test_start_batch(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        started = bp.start_batch(b.batch_id)
        assert started.status.value == "running"

    def test_start_batch_not_found(self, tmp_path):
        bp = _bp(tmp_path)
        with pytest.raises(ValueError, match="Batch not found"):
            bp.start_batch("ghost")

    def test_pause_and_resume_batch(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        bp.start_batch(b.batch_id)
        paused  = bp.pause_batch(b.batch_id)
        assert paused.status.value == "paused"
        resumed = bp.resume_batch(b.batch_id)
        assert resumed.status.value == "running"

    def test_cancel_batch_skips_pending_items(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        bp.add_items(b.batch_id, [{"i": i} for i in range(3)])
        bp.start_batch(b.batch_id)
        cancelled = bp.cancel_batch(b.batch_id)
        assert cancelled.status.value == "cancelled"
        items = bp.get_items(b.batch_id)
        assert all(i.status.value == "skipped" for i in items)

    def test_cancel_batch_not_found(self, tmp_path):
        bp = _bp(tmp_path)
        with pytest.raises(ValueError, match="Batch not found"):
            bp.cancel_batch("ghost")


class TestBatchProcessorItemOperations:
    """Item claiming, completion, failure, retry."""

    def _running_batch_with_items(self, tmp_path, n=3):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B", concurrency_limit=n)
        bp.add_items(b.batch_id, [{"idx": i} for i in range(n)])
        bp.start_batch(b.batch_id)
        return bp, b

    def test_claim_items_single(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path)
        claimed = bp.claim_items(b.batch_id, "worker-1", count=1)
        assert len(claimed) == 1
        assert claimed[0].status.value == "running"
        assert claimed[0].worker_id == "worker-1"

    def test_claim_items_multiple(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path, n=5)
        claimed = bp.claim_items(b.batch_id, "worker-A", count=3)
        assert len(claimed) == 3
        assert all(i.worker_id == "worker-A" for i in claimed)

    def test_claim_items_empty_returns_empty(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path, n=2)
        bp.claim_items(b.batch_id, "w", count=2)  # claim all
        remaining = bp.claim_items(b.batch_id, "w2", count=5)
        assert remaining == []

    def test_complete_item(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path)
        [item] = bp.claim_items(b.batch_id, "w", count=1)
        done   = bp.complete_item(item.item_id, {"output": "ok"})
        assert done.status.value == "completed"
        assert done.result == {"output": "ok"}
        assert done.completed_at is not None

    def test_complete_item_updates_batch_counts(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path, n=2)
        claimed = bp.claim_items(b.batch_id, "w", count=2)
        bp.complete_item(claimed[0].item_id, {})
        b2 = bp.get_batch(b.batch_id)
        assert b2.completed_items == 1

    def test_fail_item(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path)
        [item] = bp.claim_items(b.batch_id, "w", count=1)
        failed = bp.fail_item(item.item_id, "timeout error")
        assert failed.status.value == "failed"
        assert failed.error == "timeout error"
        assert failed.retries == 1

    def test_fail_item_with_retry(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path)
        [item] = bp.claim_items(b.batch_id, "w", count=1)
        retried = bp.fail_item(item.item_id, "transient", retry=True)
        assert retried.status.value == "pending"
        assert retried.retries == 1
        assert retried.worker_id is None

    def test_complete_item_not_found(self, tmp_path):
        bp = _bp(tmp_path)
        with pytest.raises(ValueError, match="Item not found"):
            bp.complete_item("ghost", {})

    def test_fail_item_not_found(self, tmp_path):
        bp = _bp(tmp_path)
        with pytest.raises(ValueError, match="Item not found"):
            bp.fail_item("ghost", "err")

    def test_auto_complete_batch_when_all_done(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path, n=2)
        claimed = bp.claim_items(b.batch_id, "w", count=2)
        bp.complete_item(claimed[0].item_id, {"r": 1})
        bp.complete_item(claimed[1].item_id, {"r": 2})
        b2 = bp.get_batch(b.batch_id)
        assert b2.status.value == "completed"

    def test_auto_fail_batch_when_all_failed(self, tmp_path):
        bp, b = self._running_batch_with_items(tmp_path, n=1)
        [item] = bp.claim_items(b.batch_id, "w", count=1)
        bp.fail_item(item.item_id, "fatal")
        b2 = bp.get_batch(b.batch_id)
        assert b2.status.value == "failed"


class TestBatchProcessorResultsAndProgress:
    """Results aggregation and progress."""

    def _completed_batch(self, tmp_path, n=3):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        bp.add_items(b.batch_id, [{"i": i} for i in range(n)])
        bp.start_batch(b.batch_id)
        claimed = bp.claim_items(b.batch_id, "w", count=n)
        for item in claimed:
            bp.complete_item(item.item_id, {"out": item.payload["i"] * 2})
        return bp, b

    def test_aggregate_results(self, tmp_path):
        bp, b = self._completed_batch(tmp_path, n=3)
        result = bp.aggregate_results(b.batch_id)
        assert result.result_id
        assert result.stats["total"] == 3
        assert result.stats["completed"] == 3
        assert result.stats["failed"] == 0
        assert result.stats["success_rate"] == 1.0
        assert len(result.aggregated["results"]) == 3

    def test_aggregate_results_with_failures(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        bp.add_items(b.batch_id, [{"i": i} for i in range(4)])
        bp.start_batch(b.batch_id)
        claimed = bp.claim_items(b.batch_id, "w", count=4)
        bp.complete_item(claimed[0].item_id, {"ok": True})
        bp.complete_item(claimed[1].item_id, {"ok": True})
        bp.fail_item(claimed[2].item_id, "err A")
        bp.fail_item(claimed[3].item_id, "err B")

        result = bp.aggregate_results(b.batch_id)
        assert result.stats["completed"] == 2
        assert result.stats["failed"] == 2
        assert result.stats["success_rate"] == 0.5
        assert len(result.aggregated["errors"]) == 2

    def test_get_result(self, tmp_path):
        bp, b = self._completed_batch(tmp_path)
        bp.aggregate_results(b.batch_id)
        r = bp.get_result(b.batch_id)
        assert r is not None
        assert r.batch_id == b.batch_id

    def test_get_result_none_before_aggregate(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B")
        assert bp.get_result(b.batch_id) is None

    def test_get_progress(self, tmp_path):
        bp = _bp(tmp_path)
        b  = bp.create_batch("B", concurrency_limit=2)
        bp.add_items(b.batch_id, [{"i": i} for i in range(4)])
        bp.start_batch(b.batch_id)
        claimed = bp.claim_items(b.batch_id, "w", count=2)
        bp.complete_item(claimed[0].item_id, {})
        bp.fail_item(claimed[1].item_id, "oops")

        progress = bp.get_progress(b.batch_id)
        assert progress["total"] == 4
        assert progress["completed"] == 1
        assert progress["failed"] == 1
        assert progress["pending"] == 2
        assert 0.0 <= progress["pct_complete"] <= 100.0

    def test_get_progress_not_found(self, tmp_path):
        bp = _bp(tmp_path)
        with pytest.raises(ValueError, match="Batch not found"):
            bp.get_progress("ghost")

    def test_batch_result_dict(self, tmp_path):
        bp, b = self._completed_batch(tmp_path, n=2)
        result = bp.aggregate_results(b.batch_id)
        d = result.dict
        assert "result_id" in d
        assert "stats" in d
        assert "aggregated" in d
