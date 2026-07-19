"""Turn a raw User-Agent header into a short, human-readable label like
"Chrome on macOS" for the linked-devices list. Deliberately simple regex
matching rather than a full UA-parsing library - we only need something
recognizable, not perfectly accurate."""

import re

BROWSER_PATTERNS = [
    ("Edge", r"Edg/"),
    ("Chrome", r"Chrome/"),
    ("Firefox", r"Firefox/"),
    ("Safari", r"Version/.*Safari/"),
    ("Opera", r"OPR/"),
]

OS_PATTERNS = [
    ("Windows", r"Windows"),
    ("macOS", r"Mac OS X"),
    ("iOS", r"iPhone|iPad"),
    ("Android", r"Android"),
    ("Linux", r"Linux"),
]


def label_for_user_agent(user_agent: str | None) -> str:
    if not user_agent:
        return "Unknown device"

    browser = next((name for name, pattern in BROWSER_PATTERNS if re.search(pattern, user_agent)), None)
    os_name = next((name for name, pattern in OS_PATTERNS if re.search(pattern, user_agent)), None)

    if browser and os_name:
        return f"{browser} on {os_name}"
    if browser:
        return browser
    if os_name:
        return os_name
    return "Unknown device"
