// 2번(프로젝트), 3번(지원)과 같이 쓰는 선택지입니다.
// 비슷한 이름은 하나로 합쳤습니다. 예: MySQL·PostgreSQL·MariaDB → SQL, HTML·CSS → HTML/CSS.
// 새 값을 화면마다 따로 적지 말고 여기만 고칩니다.

export const ROLES = [
  { value: "client", label: "의뢰인" },
  { value: "freelancer", label: "프리랜서" },
] as const;

export type UserRole = (typeof ROLES)[number]["value"];

export const CATEGORIES = ["웹 개발", "앱 개발", "디자인", "기획", "데이터·AI"] as const;

export type Category = (typeof CATEGORIES)[number];

export const SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Vue",
  "HTML/CSS",
  "Node.js",
  "Python",
  "Java",
  "Kotlin",
  "Swift",
  "PHP",
  "SQL",
  "Figma",
] as const;

export type Skill = (typeof SKILLS)[number];
