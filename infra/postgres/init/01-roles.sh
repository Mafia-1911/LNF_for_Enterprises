#!/bin/bash
# Runs once, on the first start of an empty data volume.
# Two login roles (plan §2, ADR-0004):
#   lf_owner  owns the database and runs migrations; may create test databases
#   lf_app    the role the app connects as; privileges come from migrations
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE lf_owner LOGIN PASSWORD '${LF_OWNER_PASSWORD}' CREATEDB;
CREATE ROLE lf_app LOGIN PASSWORD '${LF_APP_PASSWORD}';
CREATE DATABASE lostfound OWNER lf_owner;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname lostfound <<SQL
REVOKE ALL ON DATABASE lostfound FROM PUBLIC;
GRANT CONNECT ON DATABASE lostfound TO lf_app;
SQL
