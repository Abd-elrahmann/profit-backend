import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(body: {
        name: string;
        email: string;
        password: string;
        phone: string;
    }): Promise<{
        message: string;
    }>;
    login(body: {
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
    logout(req: any): Promise<{
        message: string;
    }>;
    profile(req: any): Promise<{
        id: number;
        email: string;
        phone: string;
        name: string;
        profileImage: string | null;
        isActive: boolean;
        roleId: number | null;
        createdAt: Date;
    } | null>;
    updateProfile(req: any, body: {
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
    uploadProfileImage(req: any, file: Express.Multer.File): Promise<{
        message: string;
        profileImage: string;
        user: {
            id: number;
            email: string;
            name: string;
            profileImage: string | null;
        };
    }>;
    updatePassword(req: any, body: {
        oldPassword: string;
        newPassword: string;
        confirmPassword: string;
    }): Promise<{
        message: string;
    }>;
    requestReset(body: {
        email: string;
    }): Promise<{
        message: string;
    }>;
    resetPassword(body: {
        token: string;
        newPassword: string;
        confirmPassword: string;
    }): Promise<{
        message: string;
    }>;
    getUserModulePermissions(req: any, module: string): Promise<string[]>;
    getUserModules(req: any): Promise<string[]>;
}
