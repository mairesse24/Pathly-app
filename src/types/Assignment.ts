export interface Assignment {

    id: string;

    title: string;

    courseId: string;

    dueDate: string;

    estimatedStudyTime: number;

    status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "overdue";
}