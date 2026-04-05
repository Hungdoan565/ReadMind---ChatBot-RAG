# Frontend Dockerfile — multi-stage build
# Stage 1: build — npm install + vite build
# Stage 2: runtime — nginx serves the static files

# ---- Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build
COPY . .

# Build args allow overriding the API URL at build time:
#   docker build --build-arg VITE_API_URL=https://api.example.com ...
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build


# ---- Runtime ----
FROM nginx:alpine AS runtime

# Remove default nginx site config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config for SPA (React Router support)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx runs as non-root by default in alpine
CMD ["nginx", "-g", "daemon off;"]
