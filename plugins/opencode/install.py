#!/usr/bin/env python3
"""Install/remove only this plugin file; never rewrite OpenCode configuration."""
import argparse
import hashlib
import json
import os
from pathlib import Path

NAME = "pellucid-chat-naming.js"
RECEIPT = ".pellucid-chat-naming.receipt.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_directory(path):
    path = Path(os.path.abspath(path))
    for part in [*reversed(path.parents), path]:
        if part.is_symlink():
            raise ValueError(f"Refusing symlink directory: {part}")
        if part.exists() and not part.is_dir():
            raise ValueError(f"Not a directory: {part}")
    return path


def apply(action, config_dir, source):
    target_dir = safe_directory(config_dir) / "plugins"
    safe_directory(target_dir)
    target, receipt = target_dir / NAME, target_dir / RECEIPT
    if target.is_symlink() or receipt.is_symlink():
        raise ValueError("Refusing symlink plugin or receipt")
    if action == "install":
        expected = digest(source)
        if target.exists() or receipt.exists():
            if target.is_file() and receipt.is_file():
                record = json.loads(receipt.read_text())
                if record == {"file": NAME, "sha256": expected, "version": "0.1.1"} and digest(target) == expected:
                    return {"changed": False, "path": str(target)}
            raise ValueError("Existing or changed plugin/receipt; no files overwritten")
        target_dir.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as out:
            out.write(source.read_bytes())
        try:
            with receipt.open("x") as out:
                json.dump({"file": NAME, "sha256": expected, "version": "0.1.1"}, out)
        except BaseException:
            if digest(target) == expected:
                target.unlink()
            raise
        return {"changed": True, "path": str(target), "next": "Open a new OpenCode session in this scope"}
    if not receipt.exists():
        raise ValueError("No owned installation receipt; nothing removed")
    record = json.loads(receipt.read_text())
    if record.get("file") != NAME or not target.is_file() or digest(target) != record.get("sha256"):
        raise ValueError("Installed file was changed or removed; preserved for manual review")
    target.unlink()
    receipt.unlink()
    return {"changed": True, "removed": str(target), "statePreserved": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "uninstall"])
    parser.add_argument("--config-dir", required=True, type=Path,
                        help="Explicit project .opencode or user OpenCode config directory")
    args = parser.parse_args()
    try:
        print(json.dumps(apply(args.action, args.config_dir, Path(__file__).with_name(NAME))))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.exit(2, f"{error}\n")


if __name__ == "__main__":
    main()
