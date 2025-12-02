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
        }[];
    }): Promise<{
        message: string;
        role: {
            permissions: {
                id: number;
                roleId: number;
                createdAt: Date;
                updatedAt: Date;
                module: string;
                canView: boolean;
                canAdd: boolean;
                canUpdate: boolean;
                canDelete: boolean;
                canPost: boolean;
            }[];
        } & {
            id: number;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
        };
    }>;
    getRoles(id?: number, name?: string): Promise<{
        total: number;
        roles: {
            createdAt: string | null;
            updatedAt: string | null;
            permissions: {
                id: number;
                roleId: number;
                createdAt: Date;
                updatedAt: Date;
                module: string;
                canView: boolean;
                canAdd: boolean;
                canUpdate: boolean;
                canDelete: boolean;
                canPost: boolean;
            }[];
            id: number;
            name: string;
            description: string | null;
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
        }[];
    }): Promise<{
        message: string;
        role: {
            id: number;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
        };
    }>;
    deleteRole(req: any, id: number): Promise<{
        message: string;
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
