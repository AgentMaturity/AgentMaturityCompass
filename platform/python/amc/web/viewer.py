"""
AMC Web Viewer - Browser-based Results with Shareable Reports
Similar to 'promptfoo view', opens browser showing maturity scores, test results, comparison matrix.
Generates shareable report URLs for team collaboration.
"""
from __future__ import annotations

import json
import uuid
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import uvicorn

from amc.score.dimensions import CompositeScore, DimensionScore
from amc.score.questionnaire import QuestionnaireEngine

log = structlog.get_logger(__name__)

# Global storage for results (in production, use Redis/DB)
_RESULTS_STORE: dict[str, dict[str, Any]] = {}


class AMCViewer:
    """Web UI for viewing AMC assessment results with shareable URLs."""
    
    def __init__(self, host: str = "127.0.0.1", port: int = 8080):
        self.host = host
        self.port = port
        self.app = self._create_app()
    
    def _create_app(self) -> FastAPI:
        """Create FastAPI app with templates and routes."""
        app = FastAPI(title="AMC Results Viewer", version="1.0.0")
        
        # Setup templates
        templates_dir = Path(__file__).parent / "templates"
        templates = Jinja2Templates(directory=str(templates_dir))
        
        # Setup static files
        static_dir = Path(__file__).parent / "static"
        if static_dir.exists():
            app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
        
        @app.get("/", response_class=HTMLResponse)
        async def index():
            """Landing page with recent results."""
            return HTMLResponse("""
            <html><head><title>AMC Results Viewer</title></head>
            <body style="font-family: system-ui; padding: 2rem; text-align: center;">
                <h1>AMC Results Viewer</h1>
                <p>Use 'amc view' command to generate and view assessment results.</p>
                <p>Recent results will appear here with shareable URLs.</p>
            </body></html>
            """)
        
        @app.get("/results/{result_id}", response_class=HTMLResponse)
        async def view_results(result_id: str):
            """View specific assessment results."""
            if result_id not in _RESULTS_STORE:
                raise HTTPException(status_code=404, detail="Results not found")
            
            data = _RESULTS_STORE[result_id]
            composite_score = data["composite_score"]
            
            # Prepare template data
            template_data = {
                "score_id": composite_score.score_id,
                "overall_level": composite_score.overall_level.value,
                "overall_score": composite_score.overall_score,
                "dimension_count": len(composite_score.dimension_scores),
                "dimensions": [
                    {
                        "dimension": dim.dimension.value,
                        "level": dim.level.value,
                        "score": dim.score,
                        "evidence": dim.evidence,
                        "gaps": dim.gaps
                    }
                    for dim in composite_score.dimension_scores
                ],
                "dimension_labels": json.dumps([
                    dim.dimension.value.replace('_', ' ').title() 
                    for dim in composite_score.dimension_scores
                ]),
                "dimension_scores": json.dumps([
                    dim.score for dim in composite_score.dimension_scores
                ]),
                "share_url": f"http://{self.host}:{self.port}/results/{result_id}",
                "timestamp": data.get("timestamp", datetime.now().isoformat())
            }
            
            return templates.TemplateResponse("results.html", {
                "request": None,  # Not used in our template
                **template_data
            })
        
        @app.get("/api/results/{result_id}")
        async def get_results_json(result_id: str):
            """Get results as JSON for API access."""
            if result_id not in _RESULTS_STORE:
                raise HTTPException(status_code=404, detail="Results not found")
            return _RESULTS_STORE[result_id]
        
        return app
    
    def store_results(self, composite_score: CompositeScore) -> str:
        """Store results and return shareable ID."""
        result_id = str(uuid.uuid4())[:8]  # Short ID for URLs
        _RESULTS_STORE[result_id] = {
            "composite_score": composite_score,
            "timestamp": datetime.now().isoformat(),
            "result_id": result_id
        }
        log.info("results.stored", result_id=result_id, overall_level=composite_score.overall_level)
        return result_id
    
    def start_server(self, open_browser: bool = True) -> None:
        """Start the web server."""
        url = f"http://{self.host}:{self.port}"
        log.info("viewer.starting", url=url)
        
        if open_browser:
            # Open browser after a short delay
            import threading
            def open_browser_delayed():
                import time
                time.sleep(1.5)
                webbrowser.open(url)
            threading.Thread(target=open_browser_delayed, daemon=True).start()
        
        uvicorn.run(self.app, host=self.host, port=self.port, log_level="info")
    
    def view_results(self, composite_score: CompositeScore, open_browser: bool = True) -> str:
        """Store results and return shareable URL."""
        result_id = self.store_results(composite_score)
        url = f"http://{self.host}:{self.port}/results/{result_id}"
        
        if open_browser:
            webbrowser.open(url)
        
        return url


def create_sample_results() -> CompositeScore:
    """Create sample results for testing."""
    from amc.score.dimensions import CompositeScore, DimensionScore, Dimension, MaturityLevel
    
    dimensions = [
        DimensionScore(
            dimension=Dimension.GOVERNANCE,
            level=MaturityLevel.L3,
            score=75,
            evidence=["Documented AI policy", "RACI matrix defined", "Quarterly reviews"],
            gaps=["No pre-release risk assessments", "Limited audit trail coverage"]
        ),
        DimensionScore(
            dimension=Dimension.SECURITY,
            level=MaturityLevel.L2,
            score=60,
            evidence=["Basic access controls", "Some input validation"],
            gaps=["No prompt injection detection", "No tool-call firewall", "Secrets in plaintext"]
        ),
        DimensionScore(
            dimension=Dimension.RELIABILITY,
            level=MaturityLevel.L2,
            score=55,
            evidence=["Basic error handling", "Manual deployment"],
            gaps=["No circuit breakers", "No rate limiting", "No health monitoring"]
        ),
        DimensionScore(
            dimension=Dimension.EVALUATION,
            level=MaturityLevel.L1,
            score=30,
            evidence=["Manual testing"],
            gaps=["No evaluation framework", "No regression tests", "No red-team testing"]
        ),
        DimensionScore(
            dimension=Dimension.OBSERVABILITY,
            level=MaturityLevel.L2,
            score=50,
            evidence=["Basic logging", "Some metrics"],
            gaps=["No structured logging", "No cost tracking", "No dashboards"]
        ),
        DimensionScore(
            dimension=Dimension.COST_EFFICIENCY,
            level=MaturityLevel.L1,
            score=25,
            evidence=["Basic usage tracking"],
            gaps=["No budgets", "No model routing", "No cost attribution"]
        ),
        DimensionScore(
            dimension=Dimension.OPERATING_MODEL,
            level=MaturityLevel.L2,
            score=45,
            evidence=["Dedicated AI team", "Some templates"],
            gaps=["No self-serve portal", "Limited orchestration", "No training program"]
        )
    ]
    
    return CompositeScore(
        overall_level=MaturityLevel.L2,
        overall_score=49,  # Average of dimension scores
        dimension_scores=dimensions,
        recommended_platform_modules={
            "shield": ["injection_detector", "skill_analyzer"],
            "enforce": ["policy_firewall", "rate_limiter"],
            "watch": ["receipt_ledger", "cost_tracker"],
            "score": ["evaluation_framework", "regression_tests"]
        }
    )


if __name__ == "__main__":
    # Test the viewer with sample data
    viewer = AMCViewer()
    sample_results = create_sample_results()
    url = viewer.view_results(sample_results, open_browser=False)
    print(f"Sample results available at: {url}")
    viewer.start_server()
