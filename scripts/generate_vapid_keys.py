"""
scripts/generate_vapid_keys.py — makes the key pair Web Push needs. Run it ONCE and put the three
lines it prints into the backend's environment (Render > Environment, and .env locally).

    python scripts/generate_vapid_keys.py you@example.com

Keep the private key secret and keep using the same pair: changing it later silently invalidates
every device that already turned reminders on (they would have to switch them off and on again).
"""

import base64
import sys

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


key = ec.generate_private_key(ec.SECP256R1())
private = b64(key.private_numbers().private_value.to_bytes(32, "big"))
public = b64(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
contact = sys.argv[1] if len(sys.argv) > 1 else "you@example.com"

print(f"VAPID_PUBLIC_KEY={public}")
print(f"VAPID_PRIVATE_KEY={private}")
print(f"VAPID_SUBJECT=mailto:{contact}")
