import sys
import os
from pathlib import Path

# Ensure backend app is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

# Provide a dummy GROQ_API_KEY so pydantic-settings doesn't error on import
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-unit-tests")
