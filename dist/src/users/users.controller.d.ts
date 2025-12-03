import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    addUser(req: any, body: {
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
    updateUser(req: any, id: number, body: {
        name?: string;
        phone?: string;
        roleId?: number;
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
    assignRole(req: any, id: number, roleId: number): Promise<{
        message: string;
    }>;
    deleteUser(req: any, id: number): Promise<{
        message: string;
    }>;
    getUsers(page: number, limit?: number, name?: string, email?: string, phone?: string, roleId?: number): Promise<{
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
}
