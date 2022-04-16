#!/bin/bash

# ==================================
# ビルドスクリプト。
# ==================================

# web画面の変更を反映したい場合、コメントアウトを外す。
# (cd ./frontend && npm run build)

docker-compose -f docker-compose-local.yaml down --rmi all
docker-compose -f docker-compose-local.yaml build --no-cache
docker-compose -f docker-compose-local.yaml up -d
