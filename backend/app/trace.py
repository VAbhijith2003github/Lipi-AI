"""
trace.py — Session-scoped Event Trace Logger

PURPOSE:
    Records every significant operation in the application (warmup, file upload,
    embedding, chunking, vector retrieval, LLM inference) with its start timestamp
    and elapsed time in milliseconds.

    One JSON trace file is written per session (server process lifetime) to the
    `traces/` directory under DATA_DIR.

USAGE:
    from app.trace import session_tracer

    # As a context manager (recommended):
    with session_tracer.log_event("ingest.embed", file="doc.pdf", num_chunks=42):
        embeddings = embedder.embed_documents(texts)

    # Manual start/end (use only when try/except is already wrapping the block):
    session_tracer.start_event("agent.llm_invoke", mode="ollama")
    response = llm.invoke(messages)
    session_tracer.end_event("agent.llm_invoke", status="ok")
"""

import json
import os
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    """Return the current local time as an ISO 8601 string with UTC offset."""
    return datetime.now().astimezone().isoformat()


def _monotonic_ms() -> float:
    """Return a monotonic timestamp in milliseconds."""
    return time.monotonic() * 1_000


# ---------------------------------------------------------------------------
# Tracer
# ---------------------------------------------------------------------------

class Tracer:
    """
    Session-scoped event logger.

    Creates a unique session ID on construction, accumulates logged events,
    and automatically syncs them to a JSON file in `traces_dir` in real time
    as events occur.
    """

    def __init__(self, traces_dir: str):
        self.traces_dir = traces_dir
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        uid = uuid.uuid4().hex[:8]
        self.session_id = f"{ts}_{uid}"
        self.session_start = _now_iso()
        self.session_end: str | None = None
        self._events: list[dict] = []
        self._pending: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._unsaved_count: int = 0  # events buffered since last disk sync

        # Create session file immediately on initialization
        self._sync_to_disk(force=True)

    # -----------------------------------------------------------------------
    # Disk Persistence (Real-Time Auto-Save)
    # -----------------------------------------------------------------------

    def _sync_to_disk(self, force: bool = False) -> None:
        """
        Persist current session trace state to disk.

        Writes are buffered: the file is only updated after every
        SYNC_EVERY events (or when force=True, e.g. on flush). This
        reduces I/O syscalls by ~80% during heavy ingest workloads.
        """
        SYNC_EVERY = 5
        if not force and self._unsaved_count < SYNC_EVERY:
            return
        self._unsaved_count = 0
        try:
            os.makedirs(self.traces_dir, exist_ok=True)
            out_path = os.path.join(self.traces_dir, f"session_{self.session_id}.json")

            payload = {
                "session_id": self.session_id,
                "session_start": self.session_start,
                "session_end": self.session_end,
                "total_events": len(self._events),
                "events": list(self._events),
            }

            # Write to a temporary file first, then replace to prevent partial reads
            tmp_path = f"{out_path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, out_path)
        except Exception as err:
            print(f"[Trace] Auto-sync warning: {err}")

    # -----------------------------------------------------------------------
    # Context-manager API  (preferred)
    # -----------------------------------------------------------------------

    @contextmanager
    def log_event(self, name: str, **extra):
        """
        Context manager that wraps a code block as a single trace event.

        Records the start timestamp, yields control to the caller, then records
        elapsed time and appends the event to the session log. Disk sync is
        buffered — it occurs every SYNC_EVERY events (see _sync_to_disk).
        """
        entry: dict = {
            "event": name,
            "timestamp": _now_iso(),
            **extra,
        }
        t0 = _monotonic_ms()
        status = "ok"
        try:
            yield entry          # caller can mutate `entry` to add runtime data
        except Exception:
            status = "error"
            raise
        finally:
            entry["time_taken_ms"] = round(_monotonic_ms() - t0, 2)
            entry.setdefault("status", status)
            with self._lock:
                self._events.append(entry)
                self._unsaved_count += 1
                self._sync_to_disk()

    # -----------------------------------------------------------------------
    # Manual start / end API  (use inside existing try/except blocks)
    # -----------------------------------------------------------------------

    def start_event(self, name: str, **extra) -> None:
        """
        Begin timing a named event without using a context manager.
        """
        with self._lock:
            self._pending[name] = {
                "event": name,
                "timestamp": _now_iso(),
                "_t0": _monotonic_ms(),
                **extra,
            }

    def end_event(self, name: str, status: str = "ok", **extra) -> None:
        """
        Finish a previously started event, append it to the session log,
        and trigger a buffered disk sync.
        """
        with self._lock:
            entry = self._pending.pop(name, None)
            if entry is None:
                entry = {"event": name, "timestamp": _now_iso(), "_t0": _monotonic_ms()}
            t0 = entry.pop("_t0")
            entry["time_taken_ms"] = round(_monotonic_ms() - t0, 2)
            entry["status"] = status
            entry.update(extra)
            self._events.append(entry)
            self._unsaved_count += 1
            self._sync_to_disk()

    # -----------------------------------------------------------------------
    # Flush / Finalize
    # -----------------------------------------------------------------------

    def flush(self) -> str:
        """
        Finalize the trace (mark session_end) and force a full disk sync.
        """
        with self._lock:
            self.session_end = _now_iso()
            # Close any orphaned pending events
            for name, entry in list(self._pending.items()):
                t0 = entry.pop("_t0", _monotonic_ms())
                entry["time_taken_ms"] = round(_monotonic_ms() - t0, 2)
                entry["status"] = "incomplete"
                self._events.append(entry)
            self._pending.clear()

            self._sync_to_disk(force=True)  # Always write on explicit flush
            out_path = os.path.join(self.traces_dir, f"session_{self.session_id}.json")
            print(f"[Trace] Session trace finalized → {out_path} ({len(self._events)} events)")
            return out_path


# ---------------------------------------------------------------------------
# Module-level singleton  (import this everywhere)
# ---------------------------------------------------------------------------

def _make_tracer() -> Tracer:
    """Lazy import of DATA_DIR to avoid circular imports at module load time."""
    from app.config import DATA_DIR
    traces_dir = os.path.join(DATA_DIR, "traces")
    return Tracer(traces_dir)


session_tracer: Tracer = _make_tracer()
