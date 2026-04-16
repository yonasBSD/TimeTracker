"""Helpers for marking session-based /api routes that overlap with /api/v1."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Optional, Tuple, Union

from flask import make_response

RouteReturn = Union[Any, Tuple[Any, int], Tuple[Any, int, dict]]


def apply_deprecated_headers_to_result(
    result: RouteReturn,
    successor_path: Optional[str] = None,
) -> Any:
    """
    Add deprecation headers to a Flask view return value (Response, or (rv, status), or triple).

    successor_path: path only (e.g. '/api/v1/search'); emitted as Link rel=successor-version.
    """
    if isinstance(result, tuple):
        if len(result) == 3:
            resp = make_response(result[0], result[1], result[2])
        elif len(result) == 2:
            resp = make_response(result[0], result[1])
        else:
            resp = make_response(result[0])
    else:
        resp = make_response(result)

    resp.headers["X-API-Deprecated"] = "true"
    if successor_path:
        resp.headers["Link"] = f'<{successor_path}>; rel="successor-version"'
    return resp


def deprecated_session_api(successor_path: Optional[str]) -> Callable[[Callable[..., RouteReturn]], Callable[..., Any]]:
    """
    Decorate a view: after it runs, stamp X-API-Deprecated (and optional Link) on the response.

    Use *inside* @login_required so unauthenticated responses are unchanged:

        @login_required
        @deprecated_session_api("/api/v1/search")
        def search(): ...
    """

    def decorator(view_func: Callable[..., RouteReturn]) -> Callable[..., Any]:
        @wraps(view_func)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            out = view_func(*args, **kwargs)
            return apply_deprecated_headers_to_result(out, successor_path)

        return wrapped

    return decorator
