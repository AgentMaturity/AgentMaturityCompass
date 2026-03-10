"""Evil MCP Server — adversarial MCP server for red-team testing of AI agents."""

from evil_mcp_server.config import AttackConfig
from evil_mcp_server.server import EvilMCPServer

__all__ = ["EvilMCPServer", "AttackConfig"]
__version__ = "0.1.0"
