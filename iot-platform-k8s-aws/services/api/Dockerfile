FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
RUN addgroup -S iot && adduser -S iot -G iot
USER iot
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "src/index.js"]
