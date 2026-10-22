FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
# vite.config.ts reads ../tarot-artwork-mapping.json (repo root); the build context is mystic-app/
COPY tarot-artwork-mapping.json /tarot-artwork-mapping.json
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
