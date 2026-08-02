import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("brave_amazon_login.py")
SPEC = importlib.util.spec_from_file_location("brave_amazon_login", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FakeContext:
    def __init__(self):
        self.requested = None

    def cookies(self, urls=None):
        self.requested = urls
        return [
            {"domain": ".amazon.com", "name": "session-id", "value": "ok"},
            {"domain": "www.amazon.com", "name": "at-main", "value": "ok"},
        ]


class CookieScopingTests(unittest.TestCase):
    def test_cookie_capture_is_scoped_to_product_origin(self):
        ctx = FakeContext()
        cookies = MODULE.cookies_for_product_origin(ctx)
        self.assertEqual(ctx.requested, "https://www.amazon.com/")
        self.assertEqual([c["name"] for c in cookies], ["session-id", "at-main"])


class RecentAuthenticationRoutingTests(unittest.TestCase):
    def test_normal_refresh_reuses_signed_in_session(self):
        self.assertTrue(
            MODULE.should_reuse_signed_in_session(
                True, goto_signin=False, email=None
            )
        )

    def test_goto_signin_forces_recent_authentication(self):
        self.assertFalse(
            MODULE.should_reuse_signed_in_session(
                True, goto_signin=True, email=None
            )
        )

    def test_explicit_email_forces_signin_flow(self):
        self.assertFalse(
            MODULE.should_reuse_signed_in_session(
                True, goto_signin=False, email="reader@example.com"
            )
        )


if __name__ == "__main__":
    unittest.main()
