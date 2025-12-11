import { RolesService } from './roles.service';
export declare class RolesController {
    private readonly rolesService;
    constructor(rolesService: RolesService);
    createRole(req: any, body: {
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
    getRoles(id?: number, name?: string): Promise<{
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
    getUserPermissions(req: any): Promise<{
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
    updateRole(req: any, id: number, body: {
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
    deleteRole(req: any, id: number): Promise<{
        message: string;
    }>;
    getDashboardPermissions(id: number): Promise<{
        permissions: {
            module: string;
            canView: boolean;
        }[];
    }>;
    addDashboardPermissions(req: any, id: number, body: {
        permissions: {
            module: string;
            canView?: boolean;
        }[];
    }): Promise<{
        message: string;
    }>;
}
