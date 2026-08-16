#!/bin/bash
exec python3 -m uvicorn calamox.backend.main:app --host 0.0.0.0 --port 7860 --log-level info
