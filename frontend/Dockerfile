# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Accept VITE_RELAY_HOST as a build arg so the built app embeds the correct relay host.
ARG VITE_RELAY_HOST=http://localhost:8001
ENV VITE_RELAY_HOST=${VITE_RELAY_HOST}

# Copy package files and install deps
COPY package.json ./
# If package-lock.json exists it will be picked up by COPY (no error if missing)
COPY package-lock.json* ./
RUN npm install

# Copy rest of the project files necessary for the build
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY index.html ./
COPY public ./public
COPY src ./src

# Build the app (Vite will read VITE_RELAY_HOST during the build)
RUN npm run build

# Production stage: serve with nginx
FROM nginx:stable-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]