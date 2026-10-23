# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# ffmpeg lets Baileys extract a preview thumbnail for video messages -
# without it the thumbnail step fails silently and recipients see a blank
# preview until they tap play.
RUN apk add --no-cache ffmpeg

# Install production deps only (sharp needs native build so must run here)
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Baileys session files land here (mounted as a volume)
RUN mkdir -p /app/sessions

EXPOSE 3000
CMD ["node", "dist/index.js"]
