# ---- Build aşaması ----
    FROM --platform=linux/amd64 node:20-alpine AS build
    WORKDIR /app
    
    # Önce sadece manifest dosyaları (layer cache için)
    COPY package.json package-lock.json ./
    COPY src/shared/package.json src/shared/
    COPY src/worker/package.json src/worker/
    COPY src/api/package.json src/api/
    
    RUN npm ci
    
    # Sonra kaynak kod
    COPY src/shared src/shared
    COPY src/worker src/worker
    
    # Sıra önemli: önce shared derlenmeli, worker ona bağımlı
    RUN npm run build --workspace @docflow/shared
    RUN npm run build --workspace @docflow/worker


# ---- Runtime aşaması ----
    FROM --platform=linux/amd64 node:20-alpine AS runtime
    WORKDIR /app
    ENV NODE_ENV=production
    
    # Manifestler yine lazım: npm, workspace symlink'lerini bunlara bakarak kuruyor
    COPY package.json package-lock.json ./
    COPY src/shared/package.json src/shared/
    COPY src/worker/package.json src/worker/
    COPY src/api/package.json src/api/
    
    # Sadece production bağımlılıkları — typescript, ts-node vs. gelmez
    RUN npm ci --omit=dev
    
    # Build aşamasından SADECE derlenmiş çıktıyı al
    COPY --from=build /app/src/shared/dist src/shared/dist
    COPY --from=build /app/src/worker/dist src/worker/dist
    
    # root olarak çalıştırma
    USER node
    
    CMD ["node", "src/worker/dist/index.js"]    