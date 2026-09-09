FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
RUN addgroup -S iot && adduser -S iot -G iot && chown -R iot:iot /app
USER iot
CMD ["node", "src/index.js"]
