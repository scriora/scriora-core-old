FROM node:22-bookworm
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=development
