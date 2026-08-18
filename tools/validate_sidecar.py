#!/usr/bin/env python3
"""
validate_sidecar.py — Validate metadata.csv or metadata.json against sidecar-schema.json.
Uses standard library where possible, and tries jsonschema library if available.

Usage:
    python3 validate_sidecar.py <path_to_sidecar> <path_to_schema_json>
"""

import os
import sys
import csv
import json

def load_schema(schema_path):
    with open(schema_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_sidecar(sidecar_path):
    ext = os.path.splitext(sidecar_path)[1].lower()
    if ext == ".json":
        with open(sidecar_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else [data]
    elif ext == ".csv":
        rows = []
        with open(sidecar_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Convert numbers and booleans where applicable for strict JSON schema verification
                converted = {}
                for k, v in row.items():
                    if v == "":
                        continue
                    if v.lower() == "true":
                        converted[k] = True
                    elif v.lower() == "false":
                        converted[k] = False
                    else:
                        try:
                            # Try integer
                            if "." not in v:
                                converted[k] = int(v)
                            else:
                                converted[k] = float(v)
                        except ValueError:
                            converted[k] = v
                rows.append(converted)
        return rows
    else:
        sys.exit(f"Unsupported sidecar format: {ext}. Must be .csv or .json")

def validate(data, schema):
    try:
        from jsonschema import validate as js_validate, ValidationError
        print("Using python 'jsonschema' library for strict validation...")
        errors = 0
        for idx, row in enumerate(data):
            try:
                js_validate(instance=row, schema=schema)
            except ValidationError as ve:
                print(f"Row {idx + 2} validation error: {ve.message} in field '{list(ve.relative_path)}'")
                errors += 1
        return errors == 0
    except ImportError:
        print("jsonschema library not found. Performing fallback validation...")
        # Simple fallback validation based on schema properties
        props = schema.get("properties", {})
        required = schema.get("required", [])
        errors = 0
        for idx, row in enumerate(data):
            # check required
            for req in required:
                if req not in row:
                    print(f"Row {idx + 2} validation error: missing required property '{req}'")
                    errors += 1
            # check type constraints
            for k, v in row.items():
                if k not in props:
                    continue
                prop_type = props[k].get("type")
                if prop_type == "number" and not isinstance(v, (int, float)):
                    print(f"Row {idx + 2} validation error: field '{k}' value '{v}' is not a number")
                    errors += 1
                elif prop_type == "integer" and not isinstance(v, int):
                    print(f"Row {idx + 2} validation error: field '{k}' value '{v}' is not an integer")
                    errors += 1
                elif prop_type == "boolean" and not isinstance(v, bool):
                    print(f"Row {idx + 2} validation error: field '{k}' value '{v}' is not a boolean")
                    errors += 1
        return errors == 0

def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 validate_sidecar.py <path_to_sidecar> <path_to_schema_json>")
    
    sidecar_path = sys.argv[1]
    schema_path = sys.argv[2]
    
    if not os.path.exists(sidecar_path):
        sys.exit(f"Sidecar file not found: {sidecar_path}")
    if not os.path.exists(schema_path):
        sys.exit(f"Schema file not found: {schema_path}")
        
    schema = load_schema(schema_path)
    data = load_sidecar(sidecar_path)
    
    print(f"Validating {len(data)} entries...")
    if validate(data, schema):
        print("Validation succeeded! All entries match the sidecar schema.")
        sys.exit(0)
    else:
        print("Validation failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
