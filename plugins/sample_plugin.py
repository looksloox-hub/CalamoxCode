"""
Sample Calamox Plugin — demonstrates the plugin API.

Drop this file (or your own) into the plugins/ directory and Calamox
will auto-detect it on startup. See plugin_engine.py for discovery logic.
"""

PLUGIN_NAME = "System Info"
PLUGIN_DESCRIPTION = "Returns system information as structured data."
PLUGIN_VERSION = "1.0.0"
PLUGIN_AUTHOR = "Calamox"


def get_system_info() -> dict:
    """Return basic system information."""
    import platform
    import os
    return {
        "os": platform.system(),
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "hostname": platform.node(),
        "pid": os.getpid(),
        "cwd": os.getcwd(),
    }


def echo(text: str) -> str:
    """Echo back the input text (useful for testing plugin invocation)."""
    return f"Plugin echo: {text}"


def add(a: float, b: float) -> float:
    """Add two numbers together."""
    return a + b
