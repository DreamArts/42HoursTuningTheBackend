#!/bin/bash

# ===========================
# ローカル開発環境用APIテストスクリプト
# APIテストをフォールバックモードで実施します。
# フォールバックモードでは、一部の項目はテストされません。
# ===========================

(cd ../scoring/tool && node ./nodeTool/check.js "fallback") || echo "処理に失敗しました。"
docker compose logs backend > docker-backend.log
