"""Plugin Engine — discovers, loads, and exposes user-created plugins as tools."""

import importlib.util
import inspect
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .config import settings


class PluginEngine:
    """Auto-discovers and manages user plugins from the plugins/ directory."""

    def __init__(self, plugins_dir: Optional[Path] = None):
        self.plugins_dir = plugins_dir or settings.plugins_dir
        self.plugins_dir.mkdir(parents=True, exist_ok=True)
        self._plugins: dict[str, dict] = {}

    def discover(self) -> list[dict]:
        """Scan the plugins directory and register any valid plugin modules."""
        self._plugins.clear()

        for py_file in sorted(self.plugins_dir.glob("*.py")):
            if py_file.name.startswith("_"):
                continue
            try:
                spec = importlib.util.spec_from_file_location(py_file.stem, py_file)
                if not spec or not spec.loader:
                    continue
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                plugin_info = {
                    "name": getattr(module, "PLUGIN_NAME", py_file.stem),
                    "description": getattr(module, "PLUGIN_DESCRIPTION", ""),
                    "version": getattr(module, "PLUGIN_VERSION", "0.1.0"),
                    "author": getattr(module, "PLUGIN_AUTHOR", "unknown"),
                    "file": str(py_file),
                    "functions": [],
                    "loaded_at": datetime.now(timezone.utc).isoformat(),
                }

                # Discover exported functions
                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    if callable(attr) and not attr_name.startswith("_"):
                        sig = inspect.signature(attr)
                        params = [
                            {
                                "name": name,
                                "type": str(param.annotation) if param.annotation != inspect.Parameter.empty else "any",
                                "default": str(param.default) if param.default != inspect.Parameter.empty else None,
                            }
                            for name, param in sig.parameters.items()
                        ]
                        plugin_info["functions"].append({
                            "name": attr_name,
                            "doc": inspect.getdoc(attr) or "",
                            "parameters": params,
                        })

                self._plugins[py_file.stem] = plugin_info
            except Exception as e:
                self._plugins[py_file.stem] = {
                    "name": py_file.stem,
                    "error": str(e),
                    "file": str(py_file),
                }

        return list(self._plugins.values())

    def list_plugins(self) -> list[dict]:
        """Return discovered plugins."""
        if not self._plugins:
            self.discover()
        return list(self._plugins.values())

    def get_plugin(self, name: str) -> Optional[dict]:
        """Get a specific plugin's info."""
        if not self._plugins:
            self.discover()
        return self._plugins.get(name)

    def call_function(self, plugin_name: str, function_name: str, **kwargs) -> Any:
        """Call a function on a loaded plugin."""
        if not self._plugins:
            self.discover()

        info = self._plugins.get(plugin_name)
        if not info or "error" in info:
            return {"error": f"Plugin not found or failed to load: {plugin_name}"}

        spec = importlib.util.spec_from_file_location(plugin_name, info["file"])
        if not spec or not spec.loader:
            return {"error": f"Cannot reload plugin: {plugin_name}"}
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        func = getattr(module, function_name, None)
        if not func or not callable(func):
            return {"error": f"Function not found: {function_name}"}

        try:
            result = func(**kwargs)
            return {"result": result, "plugin": plugin_name, "function": function_name}
        except Exception as e:
            return {"error": str(e), "plugin": plugin_name, "function": function_name}


# Singleton
plugin_engine = PluginEngine()
