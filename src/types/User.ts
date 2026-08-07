export interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;

    university: string;
    major: string;

    catalogYear?: number;
    graduationYear?: number;
}