# Background Remover API

后端 API 服务，支持用户认证、订阅管理和背景去除功能。

## 技术栈

- **Runtime**: Node.js 18+ + TypeScript
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Cache**: Redis
- **Auth**: JWT + Google OAuth
- **Payments**: PayPal

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入实际值
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
npm run db:generate

# 推送 schema 到数据库
npm run db:push

# 或创建迁移文件
npm run db:migrate
```

### 4. 启动开发服务器

```bash
npm run dev
```

## 部署到腾讯云

### 方案一：Docker Compose (推荐)

```bash
# 在腾讯云服务器上
git clone <repo>
cd backend
docker-compose up -d
```

### 方案二：手动部署

```bash
# 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# 安装 Redis
sudo apt-get install -y redis-server

# 配置 PostgreSQL
sudo -u postgres psql
CREATE DATABASE background_remover;
CREATE USER admin WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE background_remover TO admin;

# 构建和启动
npm run build
npm start
```

## API 文档

### 认证

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/auth/google` | Google 登录 |
| POST | `/api/auth/github` | GitHub 登录 (开发中) |
| GET | `/api/auth/me` | 获取当前用户 |

### 订阅

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/subscription` | 获取订阅信息 |
| POST | `/api/subscription/create-checkout` | 创建 PayPal 订单 |
| POST | `/api/subscription/cancel` | 取消订阅 |

### 用户

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/user/me` | 获取用户资料 |
| PATCH | `/api/user/me` | 更新用户资料 |

### API Keys (Pro/Enterprise)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/api-keys` | 列出 API Keys |
| POST | `/api/api-keys` | 创建 API Key |
| DELETE | `/api/api-keys/:id` | 删除 API Key |

### 使用量

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/usage/stats` | 获取使用统计 |
| GET | `/api/usage/logs` | 获取使用记录 |

## 前端集成示例

```typescript
// 登录
const response = await fetch('/api/auth/google', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: googleToken }),
});
const { token, user } = await response.json();

// 使用 API (带认证)
const apiResponse = await fetch('/api/subscription', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

## 环境变量说明

| 变量 | 描述 | 必需 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | ✅ |
| `JWT_SECRET` | JWT 签名密钥 | ✅ |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | ✅ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | ✅ |
| `PAYPAL_CLIENT_ID` | PayPal Client ID | ✅ (如需支付) |
| `PAYPAL_CLIENT_SECRET` | PayPal Client Secret | ✅ (如需支付) |
| `PAYPAL_MODE` | `sandbox` 或 `live` | ✅ (如需支付) |
| `FRONTEND_URL` | 前端 URL (CORS) | ✅ |

## 目录结构

```
backend/
├── src/
│   ├── index.ts          # 入口文件
│   ├── routes/           # API 路由
│   │   ├── auth.ts
│   │   ├── subscription.ts
│   │   ├── user.ts
│   │   ├── usage.ts
│   │   └── apiKey.ts
│   ├── middleware/       # 中间件
│   │   ├── auth.ts
│   │   └── errorHandler.ts
│   ├── services/        # 业务逻辑
│   │   ├── db.ts
│   │   ├── jwt.ts
│   │   └── backgroundRemoval.ts
│   ├── types/           # TypeScript 类型
│   │   └── index.ts
│   └── utils/
├── prisma/
│   └── schema.prisma     # 数据库 Schema
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## License

MIT
