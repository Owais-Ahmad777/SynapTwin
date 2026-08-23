"""
privacy.py
----------
Role-based access control and cryptographic meter store using Fernet
(AES-128-CBC + HMAC-SHA256 authenticated encryption).
Supports all 16 SOA ITER campus buildings and Admin role views.
"""

import json
import os
from cryptography.fernet import Fernet


def _normalize_name(name: str) -> str:
    n = name.lower().replace('-', '').replace(' ', '').replace('_', '')
    if 'hostel1' in n or 'hostela' in n:
        return 'iterboyshostel1'
    if 'hostel7' in n or 'hostelb' in n:
        return 'iterboyshostel7'
    if 'hostel2' in n:
        return 'iterboyshostel2'
    if 'cblock' in n:
        return 'cblock'
    if 'ablock' in n:
        return 'ablock'
    if 'dblock' in n:
        return 'dblock'
    if 'gblock' in n:
        return 'gblock'
    if 'fblock' in n:
        return 'fblock'
    if 'library' in n:
        return 'centrallibrary'
    if 'auditorium' in n:
        return 'bansuriguruauditorium'
    if 'admin' in n and 'super' not in n:
        return 'iteradministrativeblock'
    if 'cafeteria' in n:
        return 'itercafeteria'
    if 'sports' in n or 'sblock' in n:
        return 'sblocksportscomplex'
    if 'datascience' in n or 'data' in n:
        return 'centrefordatascience'
    if 'research' in n or '825753849' in n:
        return 'researchinnovationwing'
    if 'substation' in n or 'utility' in n or '1126221949' in n:
        return 'campusutilitysubstation'
    return n


class SecureMeterStore:
    """
    Encrypts raw building telemetry records at rest using Fernet (AES-128-CBC + HMAC-SHA256).
    """
    def __init__(self, key: bytes | None = None):
        env_key = os.environ.get("FERNET_SECRET_KEY")
        if not key and env_key:
            try:
                key = env_key.strip().encode("utf-8")
            except Exception:
                key = None
        self._key = key or Fernet.generate_key()
        self._cipher = Fernet(self._key)
        self._store: dict[str, bytes] = {}

    def put_record(self, record_id: str, record: dict) -> None:
        payload = json.dumps(record).encode("utf-8")
        self._store[record_id] = self._cipher.encrypt(payload)

    def get_record(self, record_id: str) -> dict:
        token = self._store[record_id]
        decrypted = self._cipher.decrypt(token)
        return json.loads(decrypted.decode("utf-8"))

    def get_ciphertext(self, record_id: str) -> bytes:
        return self._store[record_id]


def block_view(hourly_record: dict, requesting_block_name: str) -> dict:
    """
    Opaque view for a block's own dashboard: its own numbers in full, plus
    anonymous system-wide aggregate for all peer blocks.
    """
    req_norm = _normalize_name(requesting_block_name)
    blocks = hourly_record.get("blocks", [])
    
    own = next((b for b in blocks if _normalize_name(b["name"]) == req_norm), None)
    if not own and blocks:
        own = blocks[0]

    other_blocks = [b for b in blocks if b["name"] != (own["name"] if own else "")]
    
    other_blocks_aggregate = {
        "count": len(other_blocks),
        "total_load_kw": round(sum(b.get("load_kw", 0.0) for b in other_blocks), 2),
        "total_allocated_kw": round(sum(b.get("allocated_kw", 0.0) for b in other_blocks), 2),
        "total_solar_kw": round(sum(b.get("solar_kw", 0.0) for b in other_blocks), 2),
    }

    return {
        "hour": hourly_record["hour"],
        "is_outage": hourly_record["is_outage"],
        "your_block": own,
        "other_blocks_aggregate_only": other_blocks_aggregate,
        "fairness_ratio": hourly_record.get("fairness_ratio"),
        "battery_used_kw": hourly_record.get("battery_used_kw", 0.0),
        "battery_available_kw": hourly_record.get("battery_available_kw", 0.0),
        "explanation": hourly_record.get("explanation", ""),
    }


def admin_view(hourly_record: dict) -> dict:
    """Full unredacted campus view showing all 16 buildings."""
    return hourly_record
