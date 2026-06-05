from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4


@dataclass
class JobResult:
    status: str
    message: str
    outputs: list[str] = field(default_factory=list)
    manual_url: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": self.status,
            "message": self.message,
            "outputs": self.outputs,
        }
        if self.manual_url:
            payload["manual_url"] = self.manual_url
        if self.details:
            payload["details"] = self.details
        return payload


@dataclass
class ManualSignJob:
    source_pdf: Path
    job_id: str = field(default_factory=lambda: uuid4().hex)
    page_index: int | None = None
    message: str = "Nenašel jsem místo pro podpis. Je potřeba ruční umístění."
