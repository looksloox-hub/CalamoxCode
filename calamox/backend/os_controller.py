"""OS Controller — system diagnostics, file operations, and bash command execution.

Uses the Node.js Calamox Bridge for command execution when available,
falls back to local subprocess execution otherwise.
"""

import asyncio
import os
import platform
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import psutil

from .bridge_client import bridge


async def run_command(
    command: str,
    cwd: Optional[str] = None,
    timeout: int = 120,
    env: Optional[dict[str, str]] = None,
) -> dict:
    """Execute a shell command via the bridge (preferred) or locally (fallback)."""
    started = time.perf_counter()
    # Try bridge first
    if await bridge.is_available():
        result = await bridge.exec_command(
            command=command,
            cwd=cwd,
            timeout_ms=timeout * 1000,
            env=env,
        )
        # Normalize bridge's camelCase payload to the same snake_case shape the
        # local executor returns, so callers see a consistent result dict.
        result["source"] = "bridge"
        result["exit_code"] = result.get("exitCode")
        result["duration_ms"] = result.get("durationMs", int((time.perf_counter() - started) * 1000))
        result["timed_out"] = bool(result.get("timedOut"))
        return result

    # Fallback: local subprocess
    merged_env = {**os.environ, **(env or {})}
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=merged_env,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return {
                "exit_code": -1,
                "stdout": "",
                "stderr": f"Command timed out after {timeout}s",
                "timed_out": True,
                "source": "local",
                "duration_ms": int((time.perf_counter() - started) * 1000),
            }
        return {
            "exit_code": proc.returncode,
            "stdout": stdout.decode(errors="replace"),
            "stderr": stderr.decode(errors="replace"),
            "timed_out": False,
            "source": "local",
            "duration_ms": int((time.perf_counter() - started) * 1000),
        }
    except Exception as e:
        return {
            "exit_code": -1,
            "stdout": "",
            "stderr": str(e),
            "timed_out": False,
            "source": "local",
            "duration_ms": int((time.perf_counter() - started) * 1000),
        }


async def get_system_diagnostics() -> dict:
    """Collect system diagnostics: CPU, memory, disk, uptime, OS info."""
    cpu_percent = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = shutil.disk_usage("/")
    boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc)

    # Also get bridge status
    bridge_status = await bridge.get_status()

    return {
        "os": platform.system(),
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "python_version": platform.python_version(),
        "hostname": platform.node(),
        "cpu_count": psutil.cpu_count(),
        "cpu_percent": cpu_percent,
        "memory_total_gb": round(mem.total / (1024**3), 2),
        "memory_used_gb": round(mem.used / (1024**3), 2),
        "memory_percent": mem.percent,
        "disk_total_gb": round(disk.total / (1024**3), 2),
        "disk_used_gb": round(disk.used / (1024**3), 2),
        "disk_percent": round(disk.used / disk.total * 100, 1),
        "uptime_since": boot_time.isoformat(),
        "bridge": bridge_status,
    }


async def list_directory(path: str = ".") -> dict:
    """List directory contents with metadata."""
    dir_path = Path(path).resolve()
    if not dir_path.exists():
        return {"error": f"Path not found: {path}"}
    if not dir_path.is_dir():
        return {"error": f"Not a directory: {path}"}

    entries = []
    for entry in sorted(dir_path.iterdir()):
        try:
            stat = entry.stat()
            entries.append({
                "name": entry.name,
                "type": "directory" if entry.is_dir() else "file",
                "size_bytes": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
        except PermissionError:
            entries.append({"name": entry.name, "type": "unknown", "error": "permission denied"})
    return {"path": str(dir_path), "entries": entries, "count": len(entries)}


async def read_file(path: str, max_size: int = 1_000_000) -> dict:
    """Read a file's contents (with size limit)."""
    file_path = Path(path).resolve()
    if not file_path.exists():
        return {"error": f"File not found: {path}"}
    size = file_path.stat().st_size
    if size > max_size:
        return {"error": f"File too large ({size} bytes, max {max_size})"}
    try:
        content = file_path.read_text(errors="replace")
        return {"path": str(file_path), "content": content, "size": size}
    except Exception as e:
        return {"error": str(e)}


async def write_file(path: str, content: str) -> dict:
    """Write content to a file, creating parent directories as needed."""
    file_path = Path(path).resolve()
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content)
        return {"path": str(file_path), "size": file_path.stat().st_size, "success": True}
    except Exception as e:
        return {"error": str(e), "success": False}


async def create_directory(path: str) -> dict:
    """Create a directory, including any missing parent directories (mkdir -p)."""
    dir_path = Path(path).resolve()
    try:
        dir_path.mkdir(parents=True, exist_ok=True)
        return {"path": str(dir_path), "success": True, "message": f"Created directory {dir_path}"}
    except Exception as e:
        return {"error": str(e), "success": False}


async def delete_file(path: str) -> dict:
    """Delete a file. Refuses to delete directories."""
    file_path = Path(path).resolve()
    if not file_path.exists():
        return {"error": f"File not found: {path}", "success": False}
    if file_path.is_dir():
        return {"error": f"Refusing to delete a directory with delete_file: {path}", "success": False}
    try:
        file_path.unlink()
        return {"path": str(file_path), "success": True, "message": f"Deleted {file_path}"}
    except Exception as e:
        return {"error": str(e), "success": False}


async def rename_file(path: str, new_path: str) -> dict:
    """Rename or move a file to a new path."""
    src = Path(path).resolve()
    dst = Path(new_path).resolve()
    if not src.exists():
        return {"error": f"File not found: {path}", "success": False}
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
        return {"path": str(dst), "success": True, "message": f"Moved {src} → {dst}"}
    except Exception as e:
        return {"error": str(e), "success": False}


async def edit_file(path: str, old_string: str, new_string: str, replace_all: bool = False) -> dict:
    """Surgically replace an exact substring in a file (Claude-Code-style edit).

    Returns an error when old_string is missing or ambiguous (unless replace_all).
    """
    file_path = Path(path).resolve()
    if not file_path.exists():
        return {"error": f"File not found: {path}", "success": False}
    if not old_string:
        return {"error": "old_string must not be empty", "success": False}
    try:
        content = file_path.read_text(errors="replace")
    except Exception as e:
        return {"error": str(e), "success": False}
    count = content.count(old_string)
    if count == 0:
        return {"error": f"old_string not found in {path}", "success": False}
    if count > 1 and not replace_all:
        return {
            "error": f"old_string found {count} times in {path} — pass replace_all=true or use a more specific old_string",
            "success": False,
        }
    new_content = content.replace(old_string, new_string) if replace_all else content.replace(old_string, new_string, 1)
    try:
        file_path.write_text(new_content)
    except Exception as e:
        return {"error": str(e), "success": False}
    return {
        "path": str(file_path),
        "success": True,
        "replacements": count if replace_all else 1,
        "message": f"Replaced {count if replace_all else 1} occurrence(s) in {file_path}",
    }


async def get_processes(top_n: int = 20) -> list[dict]:
    """Get the top N processes by memory usage."""
    procs = []
    for p in psutil.process_iter(["pid", "name", "memory_percent", "cpu_percent"]):
        try:
            info = p.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"],
                "cpu_percent": info["cpu_percent"] or 0,
                "memory_percent": round(info["memory_percent"] or 0, 2),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs.sort(key=lambda x: x["memory_percent"], reverse=True)
    return procs[:top_n]
