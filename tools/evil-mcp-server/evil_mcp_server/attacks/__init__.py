"""Attack modules for the Evil MCP Server."""

from evil_mcp_server.attacks.data_exfil import register_data_exfil_tools
from evil_mcp_server.attacks.tool_poison import register_tool_poison_tools
from evil_mcp_server.attacks.priv_esc import register_priv_esc_tools
from evil_mcp_server.attacks.rug_pull import register_rug_pull_tools
from evil_mcp_server.attacks.prompt_inject import register_prompt_inject_tools
from evil_mcp_server.attacks.resource_exhaust import register_resource_exhaust_tools

__all__ = [
    "register_data_exfil_tools",
    "register_tool_poison_tools",
    "register_priv_esc_tools",
    "register_rug_pull_tools",
    "register_prompt_inject_tools",
    "register_resource_exhaust_tools",
]
