"""Every function other code calls on our own modules must exist. A deleted helper used to slip through
because Python only notices a missing attribute when the line runs. Run: python tests/test_wiring.py"""

import importlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

MODULES = ["db", "email_client", "text_utils", "observability", "llm_budget", "date_utils", "search_index", "embeddings",
           "moderation", "intent", "extraction", "push_notify", "voice", "google_maps", "retrieval", "agent",
           "entitlements", "timing", "crypto_utils", "llm_client"]
SKIP_DIRS = {"venv", "node_modules", "frontend", ".git", "__pycache__"}


def test_every_called_module_function_exists():
    mods = {name: importlib.import_module(name) for name in MODULES}
    missing = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if not f.endswith(".py") or f == "test_wiring.py":
                continue
            path = os.path.join(root, f)
            src = open(path, encoding="utf-8").read()
            for name, mod in mods.items():
                for attr in set(re.findall(rf"(?<![\w.]){name}\.([A-Za-z_]\w*)", src)):
                    if attr not in ("py", "md", "sql", "yml") and not hasattr(mod, attr):  # "x.py" in a comment is a file name
                        missing.append(f"{os.path.relpath(path, ROOT)}: {name}.{attr}")
    assert not missing, "called but not defined:\n  " + "\n  ".join(sorted(missing))


if __name__ == "__main__":
    test_every_called_module_function_exists()
    print("ok")
