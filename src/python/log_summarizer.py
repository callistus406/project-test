import json
import sys
from collections import Counter


def main(path: str):
    total_reg = total_ok = total_fail = 0
    failures = Counter()

    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                j = json.loads(line)
            except json.JSONDecodeError:
                continue

            event = j.get("event")
            email = j.get("email", "")
            if event == "user_registered":
                total_reg += 1
            elif event == "login_success":
                total_ok += 1
            elif event == "login_failed":
                total_fail += 1
                if "@" in email:
                    local, dom = email.split("@", 1)
                    anon = f"{local[:3]}***@{dom}"
                else:
                    anon = "unknown"
                failures[anon] += 1

    print("========= LOG SUMMARY =========")
    print(f"Registrations:     {total_reg}")
    print(f"Login Successes:   {total_ok}")
    print(f"Login Failures:    {total_fail}")
    print("Top 5 Failed Emails:")
    for email, count in failures.most_common(5):
        print(f"  {email}: {count}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    main(sys.argv[1])
