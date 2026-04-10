FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/admin/package*.json apps/admin/
COPY apps/server/package*.json apps/server/
COPY packages/shared/package*.json packages/shared/
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_SERVER_URL=http://localhost:3000/api
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build -w @bot/admin

FROM nginx:1.27-alpine
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
