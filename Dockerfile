# Roadies: one container serving the web app, the WebSocket hub and the
# command listener. Built for Google Cloud Run (see README "Deploy").
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
