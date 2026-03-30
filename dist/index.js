"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = require("dotenv");
const express_rate_limit_1 = require("express-rate-limit");
// Routes
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const subscription_js_1 = __importDefault(require("./routes/subscription.js"));
const user_js_1 = __importDefault(require("./routes/user.js"));
const usage_js_1 = __importDefault(require("./routes/usage.js"));
const apiKey_js_1 = __importDefault(require("./routes/apiKey.js"));
const quota_js_1 = __importDefault(require("./routes/quota.js"));
const process_js_1 = __importDefault(require("./routes/process.js"));
// Middleware
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const auth_js_2 = require("./middleware/auth.js");
// Load env vars
(0, dotenv_1.config)();
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Logging
if (process.env.NODE_ENV !== 'production') {
    app.use((0, morgan_1.default)('dev'));
}
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Public routes
app.use('/api/auth', auth_js_1.default);
app.use('/api/subscription', subscription_js_1.default);
// Protected routes
app.use('/api/user', auth_js_2.authMiddleware, user_js_1.default);
app.use('/api/usage', auth_js_2.authMiddleware, usage_js_1.default);
app.use('/api/api-keys', auth_js_2.authMiddleware, apiKey_js_1.default);
app.use('/api/quota', auth_js_2.authMiddleware, quota_js_1.default);
app.use('/api/process', auth_js_2.authMiddleware, process_js_1.default);
// Error handler
app.use(errorHandler_js_1.errorHandler);
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map