import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    addUser(currentUser: any, data: {
        name: string;
        email: string;
        password: string;
        phone: string;
        roleId?: number;
    }): Promise<{
        message: string;
        user: {
            role: {
                name: string;
            } | null;
            id: number;
            email: string;
            phone: string;
            name: string;
            roleId: number | null;
            createdAt: Date;
        };
    }>;
    updateUser(id: number, currentUser: any, data: {
        name?: string;
        phone?: string;
        isActive?: boolean;
    }): Promise<{
        message: string;
        user: {
            role: {
                name: string;
            } | null;
            id: number;
            email: string;
            phone: string;
            name: string;
            isActive: boolean;
            updatedAt: Date;
        };
    }>;
    deleteUser(currentUser: any, id: number): Promise<{
        message: string;
    }>;
    getUsers(page?: number, filters?: {
        limit?: number;
        name?: string;
        email?: string;
        phone?: string;
        roleId?: number;
    }): Promise<{
        totalUsers: number;
        totalPages: number;
        currentPage: number;
        users: {
            createdAt: string;
            role: {
                name: string;
            } | null;
            id: number;
            email: string;
            phone: string;
            name: string;
            isActive: boolean;
            roleId: number | null;
        }[];
    }>;
    assignRole(userId: number, currentUser: any, roleId: number): Promise<{
        message: string;
    }>;
}
