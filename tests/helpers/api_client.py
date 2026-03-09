from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests


@dataclass
class ApiClient:
    base_url: str
    timeout: int = 25

    def url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def get(self, path: str, **kwargs: Any) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        return requests.get(self.url(path), **kwargs)

    def post(self, path: str, **kwargs: Any) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        return requests.post(self.url(path), **kwargs)


def try_json(response: requests.Response) -> dict[str, Any]:
    try:
        return response.json()
    except Exception:
        return {}
