FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API_BASE_URL=/api/v1
# Public clinic details for the landing page (src/config/clinic.ts), passed
# in by compose from CLINIC_* in .env.production. Empty hides the block.
ARG VITE_CLINIC_NAME=
ARG VITE_CLINIC_TAGLINE=
ARG VITE_CLINIC_PHONE=
ARG VITE_CLINIC_ZALO=
ARG VITE_CLINIC_EMAIL=
ARG VITE_CLINIC_ADDRESS=
ARG VITE_CLINIC_MAP_URL=
ARG VITE_CLINIC_FACEBOOK_URL=
ARG VITE_CLINIC_HOURS=
ARG VITE_CLINIC_SUNDAY_HOURS=
RUN npm run build
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80 443
