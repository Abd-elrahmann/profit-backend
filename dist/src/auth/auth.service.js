"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const nodemailer = __importStar(require("nodemailer"));
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
dotenv.config();
let AuthService = class AuthService {
    prisma;
    jwtService;
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async register(data) {
        const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
        if (existing)
            throw new common_1.BadRequestException('Email already exists');
        const hashed = await bcrypt.hash(data.password, 10);
        const user = await this.prisma.user.create({
            data: { name: data.name, email: data.email, password: hashed, phone: data.phone },
        });
        return { message: 'register successfully' };
        ;
    }
    async login(data) {
        const user = await this.prisma.user.findUnique({
            where: { email: data.email },
            include: { role: true }
        });
        if (!user)
            throw new common_1.UnauthorizedException('خطأ في بيانات الدخول');
        const isMatch = await bcrypt.compare(data.password, user.password);
        if (!isMatch)
            throw new common_1.UnauthorizedException('كلمة السر غير صحيحة');
        if (!user.roleId || !user.role) {
            throw new common_1.UnauthorizedException('ليس لديك أي صلاحيات أو أدوار للدخول على النظام. برجاء التواصل مع المدير لتعيين الصلاحية.');
        }
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                isActive: true
            }
        });
        await this.prisma.auditLog.create({
            data: {
                userId: user.id,
                screen: 'Auth',
                action: 'login',
                description: `المستخدم ${user.name} قام بتسجيل الدخول`,
            },
        });
        return this.generateToken(user);
    }
    async logout(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        await this.prisma.user.update({
            where: { id: userId },
            data: { isActive: false },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: user.id,
                screen: 'Auth',
                action: 'logout',
                description: `المستخدم ${user.name} قام بتسجيل الخروج`,
            },
        });
        return { message: 'تم تسجيل الخروج بنجاح' };
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                roleId: true,
                isActive: true,
                createdAt: true,
                profileImage: true
            },
        });
        return user;
    }
    generateToken(user) {
        const payload = { sub: user.id, email: user.email };
        const accessToken = this.jwtService.sign(payload);
        return {
            accessToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profileImage: user.profileImage
            }
        };
    }
    async updateProfile(userId, data) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (data.phone && data.phone !== user.phone) {
            const phoneExists = await this.prisma.user.findUnique({ where: { phone: data.phone } });
            if (phoneExists)
                throw new common_1.BadRequestException('رقم الهاتف مستخدم مسبقاً');
        }
        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: {
                name: data.name ?? user.name,
                phone: data.phone ?? user.phone,
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                updatedAt: true,
                profileImage: true
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: user.id,
                screen: 'Auth',
                action: 'UPDATE',
                description: `المستخدم ${user.name} قام بتحديث ملفه الشخصي`,
            },
        });
        return { message: 'تم تعديل البروفايل بنجاح', user: updated };
    }
    async uploadProfileImage(userId, file) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const uploadDir = path.join(process.cwd(), 'uploads', 'profiles', userId.toString());
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const fileExtension = path.extname(file.originalname);
        const filename = `profile-${Date.now()}${fileExtension}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);
        const publicPath = `${process.env.URL}uploads/profiles/${userId}/${filename}`;
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { profileImage: publicPath },
            select: {
                id: true,
                name: true,
                email: true,
                profileImage: true
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: user.id,
                screen: 'Auth',
                action: 'UPDATE',
                description: `المستخدم ${user.name} قام بتحديث صورته الشخصية`,
            },
        });
        return {
            message: 'تم رفع صورة البروفايل بنجاح',
            profileImage: publicPath,
            user: updatedUser
        };
    }
    async updatePassword(userId, dto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        const isOldPasswordCorrect = await bcrypt.compare(dto.oldPassword, user.password);
        if (!isOldPasswordCorrect)
            throw new common_1.UnauthorizedException('كلمة السر القديمة غير صحيحة');
        const isNewSameAsOld = await bcrypt.compare(dto.newPassword, user.password);
        if (isNewSameAsOld) {
            throw new common_1.BadRequestException('كلمة السر الجديدة لا يمكن أن تكون نفس القديمة');
        }
        if (dto.newPassword !== dto.confirmPassword) {
            throw new common_1.BadRequestException('كلمات السر غير متطابقة');
        }
        const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
        return { message: 'تم تحديث كلمة السر' };
    }
    async requestResetPassword(email) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        const randomToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(randomToken).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await this.prisma.resetPasswordToken.create({
            data: {
                userId: user.id,
                token: hashedToken,
                expiresAt,
            },
        });
        const resetLink = `${process.env.FRONT}/reset-password?token=${encodeURIComponent(randomToken)}`;
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'اعادة تعيين كلمة السر',
            text: `اضغط على الرابط التالي لاعادة تعيين كلمة السر (ينتهي خلال 10 دقائق): ${resetLink}`,
        });
        return { message: 'تم ارسال لينك اعادة تعيين كلمة السر بإيميلك.' };
    }
    async resetPassword(data) {
        const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');
        const resetToken = await this.prisma.resetPasswordToken.findFirst({
            where: { token: hashedToken },
        });
        if (!resetToken)
            throw new common_1.BadRequestException('Invalid or expired token');
        if (resetToken.expiresAt < new Date()) {
            await this.prisma.resetPasswordToken.delete({ where: { id: resetToken.id } });
            throw new common_1.BadRequestException('انتهى الرابط');
        }
        if (data.newPassword !== data.confirmPassword) {
            throw new common_1.BadRequestException('كلمات السر غير متطابقة');
        }
        const hashedPassword = await bcrypt.hash(data.newPassword, 10);
        await this.prisma.user.update({
            where: { id: resetToken.userId },
            data: { password: hashedPassword },
        });
        await this.prisma.resetPasswordToken.deleteMany({ where: { userId: resetToken.userId } });
        return { message: 'تم اعادة تعيين كلمة السر بنجاح.' };
    }
    async getUserModulePermissions(userId, module) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: {
                    include: {
                        permissions: {
                            where: { module },
                        },
                    },
                },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.role)
            return [];
        if (user.role.permissions.length === 0)
            return [];
        const permission = user.role.permissions[0];
        const permissionsList = [];
        if (permission.canView)
            permissionsList.push('View');
        if (permission.canAdd)
            permissionsList.push('Add');
        if (permission.canUpdate)
            permissionsList.push('Update');
        if (permission.canDelete)
            permissionsList.push('Delete');
        if (permission.canPost)
            permissionsList.push('Post');
        if (permission.canExport)
            permissionsList.push('Export');
        return permissionsList;
    }
    async getUserModules(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: {
                    include: {
                        permissions: true,
                    },
                },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.role)
            throw new common_1.BadRequestException('User has no assigned role');
        if (!user.role.permissions || user.role.permissions.length === 0)
            return [];
        const modules = [...new Set(user.role.permissions.map((perm) => perm.module))];
        return modules;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map