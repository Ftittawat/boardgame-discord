FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY core/ ./core/
COPY slices/ ./slices/

USER node

CMD ["node", "core/index.js"]
