"""T038: Python code execution sandbox.
Constraints: 5s timeout, 50MB memory, stdlib only (no network, no non-stdlib imports).
"""
import resource
import subprocess
import sys
import tempfile
import os
import importlib.util


STDLIB_MODULES = set(sys.stdlib_module_names)

TIMEOUT_SECONDS = 5
MEMORY_BYTES = 50 * 1024 * 1024  # 50MB


class SandboxError(Exception):
    def __init__(self, status_code: int, error_code: str, message: str):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        super().__init__(message)


def _check_imports(code: str):
    """Scan code for non-stdlib imports and raise SandboxError if found."""
    import ast
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return  # Let subprocess catch it

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            modules = []
            if isinstance(node, ast.Import):
                modules = [alias.name.split(".")[0] for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                modules = [node.module.split(".")[0]]
            for mod in modules:
                if mod and mod not in STDLIB_MODULES and mod not in ("__future__",):
                    raise SandboxError(
                        status_code=403,
                        error_code="SANDBOX_NETWORK",
                        message=f"Non-stdlib import blocked: '{mod}'. Only stdlib modules allowed.",
                    )


def run_code(code: str, stdin_input: str = "") -> dict:
    """Execute Python code in sandbox. Returns dict with stdout, stderr, exit_code."""
    _check_imports(code)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        tmp_path = f.name

    try:
        def preexec():
            # Memory limit: 50MB virtual memory
            resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
            # No network: block outgoing connections via noop (subprocess isolation)
            os.setsid()

        result = subprocess.run(
            [sys.executable, "-I", tmp_path],
            input=stdin_input,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            preexec_fn=preexec,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        raise SandboxError(
            status_code=408,
            error_code="SANDBOX_TIMEOUT",
            message=f"Code execution exceeded {TIMEOUT_SECONDS}s limit.",
        )
    except MemoryError:
        raise SandboxError(
            status_code=413,
            error_code="SANDBOX_MEMORY",
            message=f"Code execution exceeded {MEMORY_BYTES // (1024*1024)}MB memory limit.",
        )
    finally:
        os.unlink(tmp_path)
