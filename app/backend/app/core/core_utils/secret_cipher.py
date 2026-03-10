from __future__ import annotations

import base64
import hashlib
import hmac
import os


def _derive_key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def _keystream(key: bytes, nonce: bytes, size: int) -> bytes:
    blocks: list[bytes] = []
    counter = 0
    while sum(len(block) for block in blocks) < size:
        counter_bytes = counter.to_bytes(8, "big")
        blocks.append(hmac.new(key, nonce + counter_bytes, hashlib.sha256).digest())
        counter += 1
    stream = b"".join(blocks)
    return stream[:size]


def encrypt_secret(secret: str, key: str) -> str:
    data = secret.encode("utf-8")
    derived_key = _derive_key(key)
    nonce = os.urandom(16)
    stream = _keystream(derived_key, nonce, len(data))
    encrypted = bytes(left ^ right for left, right in zip(data, stream))
    tag = hmac.new(derived_key, nonce + encrypted, hashlib.sha256).digest()
    payload = nonce + encrypted + tag
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decrypt_secret(payload: str, key: str) -> str:
    raw = base64.urlsafe_b64decode(payload.encode("ascii"))
    if len(raw) < 16 + 32:
        raise ValueError("Invalid encrypted payload")

    nonce = raw[:16]
    tag = raw[-32:]
    encrypted = raw[16:-32]
    derived_key = _derive_key(key)
    expected_tag = hmac.new(derived_key, nonce + encrypted, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("Invalid secret key or payload")

    stream = _keystream(derived_key, nonce, len(encrypted))
    data = bytes(left ^ right for left, right in zip(encrypted, stream))
    return data.decode("utf-8")
