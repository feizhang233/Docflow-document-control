TRANSMITTAL_TYPES = ("PZI", "RFI", "RPT")


def prefix_for_type(project_code: str, transmittal_type: str) -> str:
    return f"{project_code}-PCH-TRA-{transmittal_type}-"


def sequence_from(number: str | None, prefix: str) -> tuple[int, int] | None:
    if not number:
        return None
    if not number.upper().startswith(prefix.upper()):
        return None
    suffix = number[len(prefix):]
    if not suffix.isdigit():
        return None
    return int(suffix), len(suffix)


def next_in_series(prefix: str, numbers: list[str]) -> tuple[str | None, str]:
    best: tuple[int, int, str] | None = None
    for raw in numbers:
        parsed = sequence_from(raw, prefix)
        if not parsed:
            continue
        value, width = parsed
        if best is None or value > best[0]:
            best = (value, width, raw)
    if best is None:
        return None, f"{prefix}001"
    value, width, raw = best
    nxt = value + 1
    pad = max(3, width, len(str(nxt)))
    return raw, f"{prefix}{nxt:0{pad}d}"


def suggestions_for_project(project_code: str, numbers: list[str]) -> list[dict]:
    series = []
    for transmittal_type in TRANSMITTAL_TYPES:
        prefix = prefix_for_type(project_code, transmittal_type)
        latest, nxt = next_in_series(prefix, numbers)
        series.append({"type": transmittal_type, "prefix": prefix, "latest": latest, "next": nxt})
    return series
