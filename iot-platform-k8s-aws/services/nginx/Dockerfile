# PAs 1: Build-ul pentu clietul web React
FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
# SERVER_URL se inject. la build time prin ARG
ARG VITE_SERVER_URL=https://your-domain.com
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

# PAS 2: Nginx cu React build
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx.conf e injectat din ConfigMap in K8s
# pentru dev local:
# COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
