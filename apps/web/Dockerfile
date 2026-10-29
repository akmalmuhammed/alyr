# syntax=docker/dockerfile:1
# The web app (workspace, sign-in, onboarding and the customer pages) as one small Node
# server (ALY-63). Built from apps/web:
#   docker build -t alyr-web --build-arg ALYR_API_URL=http://api:8080 apps/web
#
# Next.js reads next.config.ts and every NEXT_PUBLIC_ value while building, so these are
# build arguments, not runtime settings: build one image per environment.

FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1 PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# Where this app forwards /api/* (the API's address inside the hosting network).
ARG ALYR_API_URL=http://api:8080
ARG NEXT_PUBLIC_ALYR_SITE_URL=https://alyr.qa
ARG NEXT_PUBLIC_ALYR_CONTACT_EMAIL=hello@alyr.qa
ARG NEXT_PUBLIC_ALYR_WORKSPACE_URL=
ARG NEXT_PUBLIC_ALYR_WHATSAPP=
ARG NEXT_PUBLIC_ALYR_OFFER=
ARG NEXT_PUBLIC_ALYR_CR=
ARG NEXT_PUBLIC_ALYR_PAYMENT_PROVIDER=
ARG NEXT_PUBLIC_ALYR_META_STATUS=
# PostHog's project key (D-070): public by design, it ships in every page. Empty turns analytics off.
ARG NEXT_PUBLIC_POSTHOG_KEY=
ENV ALYR_STANDALONE=1 \
    ALYR_API_URL=$ALYR_API_URL \
    NEXT_PUBLIC_ALYR_SITE_URL=$NEXT_PUBLIC_ALYR_SITE_URL \
    NEXT_PUBLIC_ALYR_CONTACT_EMAIL=$NEXT_PUBLIC_ALYR_CONTACT_EMAIL \
    NEXT_PUBLIC_ALYR_WORKSPACE_URL=$NEXT_PUBLIC_ALYR_WORKSPACE_URL \
    NEXT_PUBLIC_ALYR_WHATSAPP=$NEXT_PUBLIC_ALYR_WHATSAPP \
    NEXT_PUBLIC_ALYR_OFFER=$NEXT_PUBLIC_ALYR_OFFER \
    NEXT_PUBLIC_ALYR_CR=$NEXT_PUBLIC_ALYR_CR \
    NEXT_PUBLIC_ALYR_PAYMENT_PROVIDER=$NEXT_PUBLIC_ALYR_PAYMENT_PROVIDER \
    NEXT_PUBLIC_ALYR_META_STATUS=$NEXT_PUBLIC_ALYR_META_STATUS \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
RUN pnpm build

FROM node:22-bookworm-slim
# The order page (`/s/<shop>`) asks the API from the server while it runs, for its first
# page of items and its link preview, so the running server needs the address too. The
# cloud may override it as a normal setting.
ARG ALYR_API_URL=http://api:8080
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    ALYR_API_URL=$ALYR_API_URL
WORKDIR /web
# The standalone build carries only the files the server needs; static assets are
# copied beside it so server.js serves them.
COPY --from=build --chown=node:node /web/.next/standalone ./
COPY --from=build --chown=node:node /web/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
