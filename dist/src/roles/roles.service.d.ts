import { PrismaService } from '../prisma/prisma.service';
export declare class RolesService {
    private prisma;
    constructor(prisma: PrismaService);
    createRole(currentUser: any, data: {
        name: string;
        description?: string;
        permissions: {
            module: string;
            canView?: boolean;
            canAdd?: boolean;
            canUpdate?: boolean;
            canDelete?: boolean;
            canPost?: boolean;
            canExport?: boolean;
        }[];
    }): Promise<{
        message: string;
        role: {
            permissions: {
                createdAt: Date;
                updatedAt: Date;
                id: number;
                module: string;
                canView: boolean;
                canAdd: boolean;
                canUpdate: boolean;
                canDelete: boolean;
                canPost: boolean;
                canExport: boolean;
                roleId: number;
            }[];
        } & {
            name: string;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
            id: number;
        };
    }>;
    getRoles(filters?: {
        id?: number;
        name?: string;
    }): Promise<{
        total: number;
        roles: {
            createdAt: string | null;
            updatedAt: string | null;
            permissions: {
                createdAt: Date;
                updatedAt: Date;
                id: number;
                module: string;
                canView: boolean;
                canAdd: boolean;
                canUpdate: boolean;
                canDelete: boolean;
                canPost: boolean;
                canExport: boolean;
                roleId: number;
            }[];
            name: string;
            description: string | null;
            id: number;
        }[];
    }>;
    getUserPermissions(userId: number): Promise<{
        permissions: never[];
        role?: undefined;
    } | {
        role: {
            id: number;
            name: string;
        };
        permissions: {
            module: string;
            canView: boolean;
            canAdd: boolean;
            canUpdate: boolean;
            canDelete: boolean;
            canPost: boolean;
            canExport: boolean;
        }[];
    }>;
    updateRole(id: number, currentUser: any, data: {
        name?: string;
        description?: string;
        permissions?: {
            module: string;
            canView?: boolean;
            canAdd?: boolean;
            canUpdate?: boolean;
            canDelete?: boolean;
            canPost?: boolean;
            canExport?: boolean;
        }[];
    }): Promise<{
        message: string;
        role: {
            name: string;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
            id: number;
        };
    }>;
    deleteRole(currentUser: any, id: number): Promise<{
        message: string;
    }>;
    addDashboardPermissions(currentUser: number, roleId: number, permissions: {
        module: string;
        canView?: boolean;
    }[]): Promise<{
        message: string;
    }>;
    getDashboardPermissions(roleId: number): Promise<{
        permissions: {
            module: string;
            canView: boolean;
        }[];
    }>;
}
