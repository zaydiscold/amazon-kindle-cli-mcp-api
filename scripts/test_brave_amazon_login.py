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


if __name__ == "__main__":
    unittest.main()
