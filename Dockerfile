# One image for the web app, the worker and migrations (deploy/compose.yml picks the command).
FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY cli/package.json cli/
RUN pnpm install --frozen-lockfile
COPY . .
# Static pages (sitemap, metadata) bake in the public URL at build time.
ARG SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$SITE_URL NEXT_TELEMETRY_DISABLED=1
# Modules check their settings on import; placeholders get the build through. Real values come at runtime.
# .next/cache is the compiler's cache (about 200 MB): only the next build on the same machine would use it.
RUN BETTER_AUTH_URL=$SITE_URL DATABASE_URL=postgres://build@localhost/build BETTER_AUTH_SECRET=build-only-placeholder-at-least-32-chars \
    LINKEDIN_CLIENT_ID=build LINKEDIN_CLIENT_SECRET=build STRIPE_SECRET_KEY=sk_build STRIPE_WEBHOOK_SECRET=whsec_build \
    STRIPE_PRICE_ID=price_build ANTHROPIC_API_KEY=build pnpm build && pnpm build:worker && rm -rf .next/cache
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["pnpm", "start"]
