# Production deployment

The GitHub Actions workflow validates pull requests targeting `main`, builds the frontend and API on GitHub-hosted runners, and deploys after a push to the protected `main` branch using a self-hosted GitHub runner with access to the private production network. The deployment uses SSH/rsync, Docker Compose, and Nginx.

## GitHub Actions secrets and variables

Set the following as repository or production-environment secrets, and protect the `main` branch before enabling production deployment:

| Variable | Type | Purpose |
| --- | --- | --- |
| `APP_BACKEND_PORT` | Variable | Host loopback port used by Nginx to reach the API. |
| `SERVER_IP`, `SERVER_PORT`, `SERVER_USER`, `SERVER_PATH` | Secret | SSH deployment target and application directory. |
| `APP_BACKEND_PORT` | Secret | Host loopback port used by Nginx to reach the API. |
| `SERVER_SSH_KEY` | Secret | Private SSH key used by the deployment job. |
| `SERVER_SSH_KNOWN_HOSTS` | Secret | Verified host key entries for the server. |
| `PRODUCTION_ENV_FILE` | Secret | Multiline runtime environment content. |
| `MAPID_API_KEY` | Secret | Build-time MapID key consumed by Vite. |

Optional GitHub Actions variables are `MARTIN_PORT` (default `3001`), `NGINX_PORT` (default `8081`), and `SERVER_NAME` (default `_`).

`PRODUCTION_ENV_FILE` must define `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASS`, and `WEB_ORIGIN`. The pipeline adds the host ports to the temporary `.env.production` file used for deployment.

## Server prerequisites

Install Docker Engine with the Compose plugin, Nginx, and `rsync`. The deployment user must be able to run `sudo docker compose` and reload Nginx without an interactive password. Create the directory configured by `SERVER_PATH` and ensure the Nginx `sites-enabled` setup includes the generated `geoterracakra` site.

The deployment intentionally keeps `data/` out of rsync. Docker named volumes preserve PostGIS and Redis data between releases.

## Pipeline flow

1. Merge request pipelines targeting `main` run lint, formatting, type checking, and the build.
2. A push to `main` runs the same checks and produces build artifacts.
3. The production job copies the frontend bundle and application source to the server, installs the Nginx configuration, starts PostGIS and Redis, runs database migrations, and restarts the API and Martin.

The Nginx configuration serves the SPA from `$SERVER_PATH/fe`, proxies `/api/` to the API, and proxies `/tiles/` to Martin. Its `/api/` and `/tiles/` trailing slashes intentionally remove those public prefixes before forwarding.

## Post-deployment checks

```sh
cd "$SERVER_PATH/app"
sudo docker compose --env-file .env.production -f docker-compose.production.yml ps
curl "http://127.0.0.1:${APP_BACKEND_PORT}/health"
curl -sSI "http://127.0.0.1:${NGINX_PORT:-8081}/" | grep -i content-type
```
