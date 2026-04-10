FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/server/package*.json apps/server/
COPY apps/admin/package*.json apps/admin/
COPY packages/shared/package*.json packages/shared/
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @bot/server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY package*.json ./
EXPOSE 3000
CMD ["node", "apps/server/dist/main.js"]
