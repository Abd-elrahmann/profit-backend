import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
export declare class AuthService {
    private prisma;
    private jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    register(data: {
        name: string;
        email: string;
        password: string;
        phone: string;
    }): Promise<{
        message: string;
    }>;
    login(data: {
        email: string;
        password: string;
    }): Promise<{
        accessToken: string;
        user: {
            id: any;
            name: any;
            email: any;
            profileImage: any;
        };
    }>;
    getProfile(userId: number): Promise<{
        id: number;
        email: string;
        phone: string;
        name: string;
        profileImage: string | null;
        isActive: boolean;
        roleId: number | null;
        createdAt: Date;
    } | null>;
    private generateToken;
    updateProfile(userId: number, data: {
        name?: string;
        phone?: string;
    }): Promise<{
        message: string;
        user: {
            id: number;
            email: string;
            phone: string;
            name: string;
            profileImage: string | null;
            updatedAt: Date;
        };
    }>;
    uploadProfileImage(userId: number, file: Express.Multer.File): Promise<{
        message: string;
        profileImage: string;
        user: {
            id: number;
            email: string;
            name: string;
            profileImage: string | null;
        };
    }>;
    updatePassword(userId: number, dto: {
        oldPassword: string;
        newPassword: string;
        confirmPassword: string;
    }): Promise<{
        message: string;
    }>;
    requestResetPassword(email: string): Promise<{
        message: string;
    }>;
    resetPassword(data: {
        token: string;
        newPassword: string;
        confirmPassword: string;
    }): Promise<{
        message: string;
    }>;
    getUserModulePermissions(userId: number, module: string): Promise<string[]>;
    getUserModules(userId: number): Promise<string[]>;
}
