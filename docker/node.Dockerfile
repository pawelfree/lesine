FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts
COPY apps/api apps/api
COPY apps/worker apps/worker
RUN npm run build -w @lesine/api && npm run build -w @lesine/worker

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api apps/api
COPY --from=build /app/apps/worker apps/worker
USER node
