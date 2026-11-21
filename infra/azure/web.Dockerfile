# Web app image for the Azure VM (ADR-004; the Oracle plan serves the web app
# from Vercel instead). Built on top of the API's build stage, which already
# holds the whole workspace with its dependencies installed.
FROM local/kpi-nexus-tools:demo
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@kpi-nexus/web...
ENV NODE_ENV=production
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
