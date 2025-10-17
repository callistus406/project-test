import json
import re
import os
from hashlib import sha1

try:
    from pwnedpasswords import check as is_pwned
except ImportError:
    import urllib.request

    def is_pwned(password: str) -> bool:
        sha = sha1(password.encode("utf-8")).hexdigest().upper()
        prefix, suffix = sha[:5], sha[5:]
        url = f"https://api.pwnedpasswords.com/range/{prefix}"
        try:
            with urllib.request.urlopen(url, timeout=3) as res:
                for line in res.read().decode().splitlines():
                    if line.startswith(suffix):
                        return True
            return False
        except Exception:
            return False


def check_strength(password: str) -> dict:
    reasons = []

    if len(password) < 8:
        reasons.append("too_short")
    if not re.search(r"[A-Z]", password):
        reasons.append("no_uppercase")
    if not re.search(r"[a-z]", password):
        reasons.append("no_lowercase")
    if not re.search(r"[0-9]", password):
        reasons.append("no_number")
    if not re.search(r"[^\w\s]", password):
        reasons.append("no_symbol")

    if password and is_pwned(password):
        reasons.append("pwned_password")

    return {"ok": len(reasons) == 0, "reasons": reasons}


def handler(event, context):
    """lambda entry point"""
    try:
        body = json.loads(event.get("body") or "{}")
        pw = body.get("password", "")
        result = check_strength(pw)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result)
        }
    except Exception as e:
        return {
            "statusCode": 400,
            "body": json.dumps({"ok": False, "reasons": ["bad_request"], "error": str(e)})
        }


if __name__ == "__main__":
    samples = ["password123", "StrongPass123!", "MySecure@2025"]
    for pw in samples:
        print(f"{pw}: {check_strength(pw)}")
