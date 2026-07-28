# 后端 Dockerfile
# 多阶段构建，减小最终镜像体积

# ==================== 构建阶段 ====================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package.json ./
COPY prisma ./prisma

RUN npm install

# 生成 Prisma Client
RUN npx prisma generate

# ==================== 运行阶段 ====================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 以非 root 用户运行
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# 仅复制必要文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# 复制构建产物
COPY src ./src
COPY tsconfig.json .

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "--experimental-specifier-resolution=node", "src/index.ts"]
