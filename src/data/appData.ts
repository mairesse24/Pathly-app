import type { CalendarItem, ChatMessage, CourseSummary, DegreeRequirement, FocusTask, StudyMaterial } from "../types/app";

export const demoStudent = { name: "Mairesse N.", firstName: "Mairesse", university: "University of North Texas", major: "Computer Science", graduationYear: 2027 };
export const focusTasks: FocusTask[] = [
  { id:"csce-1030-assignment", title:"CSCE 1030 — Programming Assignment 4", detail:"Finish input validation and test cases", duration:"90 min" },
  { id:"csce-3201-review", title:"CSCE 3201 — Review neural network concepts", detail:"Lecture 6 summary + flashcards", duration:"45 min" },
  { id:"math-1710-practice", title:"MATH 1710 — Calculus practice set", detail:"Derivative applications", duration:"30 min" },
];
export const courses: CourseSummary[] = [
  { code:"CSCE 1030", name:"Programming Fundamentals I", color:"sage", next:"Programming Assignment 4 due today" },
  { code:"CSCE 1040", name:"Computer Science II", color:"gold", next:"Data structures review · Friday" },
  { code:"CSCE 3201", name:"Applied Artificial Intelligence", color:"clay", next:"Lecture 6 notes · Thursday" },
  { code:"CSCE 3610", name:"Systems Programming", color:"sage", next:"Memory model reading · Monday" },
  { code:"MATH 1710", name:"Calculus I", color:"gold", next:"Practice set · Wednesday" },
];
export const studyMaterials: StudyMaterial[] = [
  { title:"CSCE 3201 — Lecture 6: Neural Networks", type:"Lecture summary", detail:"12 min read", tone:"sage" },
  { title:"CSCE 1040 — Linked Lists & Stacks", type:"24 flashcards", detail:"Practice set", tone:"gold" },
  { title:"MATH 1710 — Derivative Applications", type:"Practice quiz", detail:"10 questions", tone:"clay" },
];
export const weekDays = ["Mon 13","Tue 14","Wed 15","Thu 16","Fri 17","Sat 18","Sun 19"];
export const calendarItems: CalendarItem[] = [
  { day:0, title:"CSCE 1030 workshop", time:"9:00–10:15", tone:"sage" },
  { day:1, title:"CSCE 1040", time:"11:00–12:15", tone:"blue" },
  { day:1, title:"Campus library shift", time:"3:30–6:30", tone:"gold", offset:true },
  { day:2, title:"MATH 1710", time:"1:00–2:15", tone:"clay" },
  { day:4, title:"CSCE 3201 concept check", time:"10:00–11:00", tone:"rose" },
];
export const degreeRequirements: DegreeRequirement[] = [
  { title:"Computer Science core", progressLabel:"21 of 39 credits", percent:54 },
  { title:"Mathematics foundation", progressLabel:"9 of 15 credits", percent:60 },
  { title:"General education", progressLabel:"26 of 42 credits", percent:62 },
  { title:"Supporting coursework", progressLabel:"11 of 24 credits", percent:46 },
];
export const dashboardExam = { title:"CSCE 1040 — Data structures review", date:"Friday, Oct 17 · 10:00 AM", countdown:"3 days away" };
export const upcomingSchedule = [
  { time:"11:00", tone:"blue", title:"CSCE 1040", location:"Discovery Park · 1 hour 15 min" },
  { time:"3:30", tone:"sage", title:"Campus library shift", location:"Willis Library · 3 hours" },
  { time:"7:00", tone:"gold", title:"CSCE 1030 study block", location:"Programming Assignment 4" },
];
export const initialMessages: ChatMessage[] = [{ id:"welcome", author:"Pathly", text:"You’ve got a full day, Mairesse. Want to make a small plan for tonight?" }];
