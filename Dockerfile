# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
COPY server/media-defaults.js ./server/media-defaults.js
COPY public ./public
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-trixie-slim
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca --mount=type=secret,id=system_ca if [ -f /run/secrets/system_ca ]; then export SSL_CERT_FILE=/run/secrets/system_ca; fi; apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core python3 python3-venv ca-certificates gosu && rm -rf /var/lib/apt/lists/*
COPY requirements-tools.txt ./
RUN --mount=type=secret,id=system_ca if [ -f /run/secrets/system_ca ]; then export PIP_CERT=/run/secrets/system_ca; fi; python3 -m venv .tools && .tools/bin/pip install --no-cache-dir -r requirements-tools.txt && .tools/bin/pip check
COPY --from=web /app/node_modules ./node_modules
COPY --from=web /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
RUN mkdir -p /var/lib/copex && chown -R node:node /app /var/lib/copex
ENV NODE_ENV=production PORT=3001 COPEX_DATA_DIR=/var/lib/copex COPEX_REQUIRE_AUTH=1
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/app/scripts/start-container.sh"]
CMD ["node", "server/index.js"]
