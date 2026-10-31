"""Read-only Unit-I Reel stock loader for the Reel issue automation."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import pymysql


def _load_runtime_env() -> None:
    candidates = (
        Path.cwd() / ".env",
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    )
    for env_path in candidates:
        if not env_path.is_file():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip().strip("\"'"))
        return


def normalize_erp(value: Any) -> str:
    text = "" if value is None else str(value).strip()
    # Google Sheets may expose an ERP entered as a number with a trailing
    # decimal, while MariaDB returns the same code as an integer/string.
    if re.fullmatch(r"\d+\.0+", text):
        return text.split(".", 1)[0]
    return text


def calculate_available_weight(weight: Any, returned: Any, issued: Any) -> float:
    return max(0.0, _number(weight) + _number(returned) - _number(issued))


def _number(value: Any) -> float:
    try:
        return float(normalize_erp(value).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def _firm_key(value: Any) -> str:
    return "".join(char for char in normalize_erp(value).lower() if char.isalnum())


def _parse_lines(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [line for line in value if isinstance(line, dict)]
    try:
        parsed = json.loads(normalize_erp(value) or "[]")
    except json.JSONDecodeError:
        return []
    return [line for line in parsed if isinstance(line, dict)] if isinstance(parsed, list) else []


def _connect() -> pymysql.connections.Connection:
    _load_runtime_env()
    required = ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing database environment variable(s): {', '.join(missing)}")
    return pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        connect_timeout=15,
        read_timeout=180,
        write_timeout=180,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def load_unit_one_reel_stock() -> list[dict[str, Any]]:
    """Return current Unit-I Reel balances without modifying the database."""

    db = _connect()
    try:
        with db.cursor() as cur:
            cur.execute("SELECT id, firmName FROM firms ORDER BY firmName")
            firms = cur.fetchall()
            unit_one = next(
                (
                    firm
                    for firm in firms
                    if _firm_key(firm.get("firmName")).endswith(("unit1", "uniti"))
                ),
                None,
            )
            if not unit_one:
                raise RuntimeError("No configured Unit-I firm was found in firms.firmName.")

            cur.execute(
                """
                SELECT
                    ps.id AS slip_id,
                    ps.materialId,
                    ps.materialInId,
                    ps.materialLineId,
                    ps.supplierId,
                    ps.ourReelNo,
                    ps.supplierReelNo,
                    ps.weightKg,
                    ps.openingRate,
                    m.erpCode,
                    m.name AS itemName,
                    m.size,
                    m.gsm,
                    m.bf,
                    m.openingRate AS materialOpeningRate,
                    COALESCE(s.name, '') AS supplier,
                    mi.supplierId AS receiptSupplierId,
                    mi.lines,
                    COALESCE(issue.issuedKg, 0) AS issuedKg,
                    COALESCE(returned.returnedKg, 0) AS returnedKg
                FROM material_in_packing_slips ps
                INNER JOIN materials m ON m.id = ps.materialId
                LEFT JOIN suppliers s ON s.id = ps.supplierId
                LEFT JOIN material_in mi
                    ON mi.id = ps.materialInId
                    AND UPPER(TRIM(ps.materialInId)) <> 'OPENING'
                LEFT JOIN (
                    SELECT packingSlipId, SUM(COALESCE(weightKg, 0)) AS issuedKg
                    FROM material_issue_reel_lines
                    GROUP BY packingSlipId
                ) issue ON issue.packingSlipId = ps.id
                LEFT JOIN (
                    SELECT packingSlipId, SUM(COALESCE(weightKg, 0)) AS returnedKg
                    FROM material_return_reel_lines
                    GROUP BY packingSlipId
                ) returned ON returned.packingSlipId = ps.id
                WHERE ps.firmId = %s
                  AND LOWER(TRIM(COALESCE(m.type, ''))) = 'reel'
                  AND LOWER(TRIM(COALESCE(m.active, 'yes'))) <> 'no'
                  AND (
                      UPPER(TRIM(ps.materialInId)) = 'OPENING'
                      OR mi.id IS NOT NULL
                  )
                ORDER BY ps.ourReelNo, ps.id
                """,
                (unit_one["id"],),
            )
            rows = cur.fetchall()
            suppliers_by_id = {}
            cur.execute("SELECT id, name FROM suppliers")
            suppliers_by_id = {normalize_erp(row.get("id")): normalize_erp(row.get("name")) for row in cur.fetchall()}

        stock: list[dict[str, Any]] = []
        for row in rows:
            is_opening = normalize_erp(row.get("materialInId")).casefold() == "opening"
            weight = _number(row.get("weightKg"))
            issued = _number(row.get("issuedKg"))
            returned = _number(row.get("returnedKg"))
            available = calculate_available_weight(weight, returned, issued)
            rate = _number(row.get("openingRate")) if is_opening else 0.0
            if not is_opening:
                lines = _parse_lines(row.get("lines"))
                line = next(
                    (item for item in lines if normalize_erp(item.get("id")) == normalize_erp(row.get("materialLineId"))),
                    None,
                ) or next(
                    (item for item in lines if normalize_erp(item.get("itemId")) == normalize_erp(row.get("materialId"))),
                    None,
                )
                if line:
                    rate = _number(line.get("invoiceRate") or line.get("poRate") or line.get("rate"))
            if not rate:
                rate = _number(row.get("materialOpeningRate"))
            supplier_id = normalize_erp(row.get("supplierId")) if is_opening else normalize_erp(row.get("receiptSupplierId"))
            stock.append(
                {
                    "our_reel_no": normalize_erp(row.get("ourReelNo")),
                    "erp": normalize_erp(row.get("erpCode")),
                    "supplier": normalize_erp(row.get("supplier")) or suppliers_by_id.get(supplier_id, ""),
                    "size": normalize_erp(row.get("size")),
                    "gsm": normalize_erp(row.get("gsm")),
                    "bf": normalize_erp(row.get("bf")),
                    "weight": weight,
                    "available_weight": available,
                    "rate": rate,
                    "supplier_reel_no": normalize_erp(row.get("supplierReelNo")),
                }
            )
        return stock
    finally:
        db.close()
