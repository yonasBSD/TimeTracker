"""Web UI tests for quotes (regression: issue #583 create -> view 500)."""

from flask import url_for


def test_create_quote_redirect_then_view_returns_200(admin_authenticated_client, test_client, app):
    with app.app_context():
        create_url = url_for("quotes.create_quote")

    resp = admin_authenticated_client.post(
        create_url,
        data={
            "client_id": str(test_client.id),
            "title": "Regression Quote 583",
            "tax_rate": "0",
            "currency_code": "EUR",
            # Triggers Valid until block + expired badge on view (issue #583 used undefined now()).
            "valid_until": "2020-01-01",
        },
        follow_redirects=False,
    )
    assert resp.status_code in (302, 303), resp.data[:500]
    location = resp.headers.get("Location", "")
    assert "/quotes/" in location

    view_resp = admin_authenticated_client.get(location, follow_redirects=False)
    assert view_resp.status_code == 200, view_resp.data[:500]
